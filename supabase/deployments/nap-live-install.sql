begin;
-- Immutable rollback snapshot; do not recreate this table on subsequent deployments.
create table private.connectors_before_nap_live_20260922 as
select id,available_count,status,availability_updated_at,availability_source,updated_at from public.connectors;
alter table private.connectors_before_nap_live_20260922 enable row level security;
revoke all on private.connectors_before_nap_live_20260922 from public,anon,authenticated,service_role;

create table private.nap_live_control (
  id boolean primary key default true check(id), enabled boolean not null default false,
  publication_time timestamptz, last_result jsonb
);
insert into private.nap_live_control(id) values(true);
alter table private.nap_live_control enable row level security;
revoke all on private.nap_live_control from public,anon,authenticated;
grant usage on schema private to service_role;
grant select,update on private.nap_live_control to service_role;

create function public.import_nap_availability(p_publication_time timestamptz,p_rows jsonb,p_apply boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_enabled boolean; v_previous timestamptz; v_result jsonb; v_updated integer; v_snapshots integer;
begin
  perform pg_advisory_xact_lock(20260922,1905);
  select enabled,publication_time into v_enabled,v_previous from private.nap_live_control where id=true;
  if p_apply and not v_enabled then raise exception 'NAP availability deployment is disabled'; end if;
  if p_publication_time is null or p_publication_time < now()-interval '45 minutes' or p_publication_time > now()+interval '5 minutes' then
    raise exception 'Expired or invalid publication time';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 15000 and 100000 then
    raise exception 'Invalid feed size';
  end if;
  if p_apply and p_publication_time <= v_previous then return jsonb_build_object('unchanged',true,'publication_time',v_previous); end if;
  create temporary table nap_live_input on commit drop as
    select * from jsonb_to_recordset(p_rows) as r(site_id text,point_id text,status text);
  if exists(select 1 from pg_temp.nap_live_input where nullif(site_id,'') is null or nullif(point_id,'') is null
    or status is null or status not in ('available','charging','outOfOrder','unknown','blocked','planned','inoperative','reserved')) then
    raise exception 'Invalid feed row';
  end if;
  create index on nap_live_input(point_id,site_id);
  analyze pg_temp.nap_live_input;
  -- Repeated point IDs are deliberately excluded, even when their states agree.
  create temporary table nap_live_unique on commit drop as
    select min(site_id) site_id,point_id,min(status) status from pg_temp.nap_live_input group by point_id having count(*)=1;
  create unique index on nap_live_unique(point_id);
  analyze pg_temp.nap_live_unique;
  create temporary table nap_live_values on commit drop as
  with mappings as (
    select distinct c.id,c.station_id,c.quantity,l.external_id site_id,sc.raw_data->>'refill_point_id' point_id
    from public.connectors c
    join public.station_source_links l on l.station_id=c.station_id and l.source='nap'
    join public.nap_staging_connectors sc on sc.batch_id=(l.metadata->>'batch_id')::uuid
      and sc.station_external_id=l.external_id and sc.type=c.type and sc.power_kw is not distinct from c.power_kw
    where c.availability_source is null or c.availability_source='mobie_nap'
  ), grouped as (
    select m.id,m.station_id,m.quantity,count(*) expected,
      count(u.point_id) received,count(*) filter(where u.status='unknown') unknown_count,
      count(*) filter(where u.status='available') free_count,
      count(*) filter(where u.status='charging') charging_count
    from mappings m left join pg_temp.nap_live_unique u on u.point_id=m.point_id and u.site_id=m.site_id
    group by m.id,m.station_id,m.quantity
  )
  select id,station_id,quantity,
    case when expected=quantity and received=expected and unknown_count=0 then free_count::integer else null end available_count,
    case when expected<>quantity or received<>expected or unknown_count>0 then 'unknown'
      when free_count>0 then 'available' when charging_count>0 then 'occupied' else 'unavailable' end status
  from grouped;
  select jsonb_build_object('matched_groups',count(*),'known_groups',count(available_count),
    'unknown_groups',count(*)-count(available_count),'available_points',sum(available_count),
    'duplicate_point_ids',(select count(*) from (select point_id from pg_temp.nap_live_input group by point_id having count(*)>1)d))
  into v_result from pg_temp.nap_live_values;
  if (v_result->>'matched_groups')::integer < 8000 then raise exception 'Unexpected matching coverage'; end if;
  if not p_apply then return v_result; end if;
  -- State-change history, not a duplicate copy of all 10k groups every 15 minutes.
  insert into public.availability_snapshots(station_id,connector_id,available_count,total_count,status,observed_at,source)
  select v.station_id,v.id,v.available_count,v.quantity,v.status,p_publication_time,'mobie_nap'
    from pg_temp.nap_live_values v join public.connectors c on c.id=v.id
    where c.availability_source is distinct from 'mobie_nap' or c.available_count is distinct from v.available_count or c.status is distinct from v.status;
  get diagnostics v_snapshots = row_count;
  update public.connectors c set available_count=v.available_count,status=v.status,
    availability_updated_at=p_publication_time,availability_source='mobie_nap',updated_at=now()
    from pg_temp.nap_live_values v where c.id=v.id;
  get diagnostics v_updated = row_count;
  v_result := v_result || jsonb_build_object('updated_groups',v_updated,'snapshots',v_snapshots,'publication_time',p_publication_time);
  update private.nap_live_control set publication_time=p_publication_time,last_result=v_result where id=true;
  return v_result;
end;
$$;
revoke all on function public.import_nap_availability(timestamptz,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_nap_availability(timestamptz,jsonb,boolean) to service_role;
commit;
