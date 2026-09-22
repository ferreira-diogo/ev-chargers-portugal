-- Safe rollback for a staging-only NAP import.
-- Replace NAP_BATCH_ID. Deleting the run cascades only to NAP staging tables.
-- It does not alter operators, charging_stations or connectors.

select
  r.batch_id,
  r.status,
  count(distinct s.external_id) as staged_sites,
  count(c.external_id) as staged_connectors
from public.nap_import_runs r
left join public.nap_staging_stations s on s.batch_id = r.batch_id
left join public.nap_staging_connectors c
  on c.batch_id = s.batch_id and c.station_external_id = s.external_id
where r.batch_id = 'NAP_BATCH_ID'::uuid
group by r.batch_id, r.status;

begin;
delete from public.nap_import_runs
where batch_id = 'NAP_BATCH_ID'::uuid
  and status in ('started', 'staged', 'validated', 'failed');
commit;

select count(*) as remaining_run
from public.nap_import_runs
where batch_id = 'NAP_BATCH_ID'::uuid;
