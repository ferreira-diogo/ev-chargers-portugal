-- Rollback da promoção NAP executada em 2026-09-22.
-- Repõe exatamente o snapshot imediatamente anterior: 32 operadores,
-- 2.331 estações, 4.284 conectores e 0 source links.
-- Executar como postgres/service role apenas em caso de rollback aprovado.

begin;

delete from public.station_source_links;
delete from public.connectors;
delete from public.charging_stations;
delete from public.operators;

insert into public.operators (
  id,name,slug,website,country_code,active,created_at
)
select id,name,slug,website,country_code,active,created_at
from backups.operators_before_nap_promotion_20260922_1015;

insert into public.charging_stations (
  id,operator_id,external_id,source,name,address,city,postal_code,country_code,
  latitude,longitude,geom,max_power_kw,status,accessibility,amenities,
  source_updated_at,created_at,updated_at
)
select
  id,operator_id,external_id,source,name,address,city,postal_code,country_code,
  latitude,longitude,geom,max_power_kw,status,accessibility,amenities,
  source_updated_at,created_at,updated_at
from backups.stations_before_nap_promotion_20260922_1015;

insert into public.connectors (
  id,station_id,external_id,type,power_kw,quantity,available_count,status,
  created_at,updated_at
)
select
  id,station_id,external_id,type,power_kw,quantity,available_count,status,
  created_at,updated_at
from backups.connectors_before_nap_promotion_20260922_1015;

insert into public.station_source_links (
  id,station_id,source,external_id,source_url,source_hash,
  first_seen_at,last_seen_at,metadata
)
select
  id,station_id,source,external_id,source_url,source_hash,
  first_seen_at,last_seen_at,metadata
from backups.station_links_before_nap_promotion_20260922_1015;

do $$
begin
  if (select count(*) from public.operators) <> 32 then
    raise exception 'Rollback operator count mismatch';
  end if;
  if (select count(*) from public.charging_stations) <> 2331 then
    raise exception 'Rollback station count mismatch';
  end if;
  if (select count(*) from public.connectors) <> 4284 then
    raise exception 'Rollback connector count mismatch';
  end if;
end $$;

commit;
