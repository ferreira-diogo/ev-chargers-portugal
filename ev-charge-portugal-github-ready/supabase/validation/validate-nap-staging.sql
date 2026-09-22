-- Replace NAP_BATCH_ID and run after a staging import.
with batch as (
  select 'NAP_BATCH_ID'::uuid as id
)
select
  r.batch_id,
  r.status,
  r.publication_time,
  r.source_sites,
  r.source_refill_points,
  count(distinct s.external_id) as staged_sites,
  count(c.external_id) as staged_connectors,
  count(*) filter (where s.latitude is null or s.longitude is null) as sites_without_coordinates
from public.nap_import_runs r
join batch b on b.id = r.batch_id
left join public.nap_staging_stations s on s.batch_id = r.batch_id
left join public.nap_staging_connectors c
  on c.batch_id = s.batch_id and c.station_external_id = s.external_id
group by r.batch_id, r.status, r.publication_time, r.source_sites, r.source_refill_points;

-- Must return zero rows.
select external_id, count(*)
from public.nap_staging_stations
where batch_id = 'NAP_BATCH_ID'::uuid
group by external_id
having count(*) > 1;

-- Must return zero rows.
select c.external_id
from public.nap_staging_connectors c
left join public.nap_staging_stations s
  on s.batch_id = c.batch_id and s.external_id = c.station_external_id
where c.batch_id = 'NAP_BATCH_ID'::uuid
  and s.external_id is null;

-- Candidate matches only: review before promotion. Nothing is changed here.
select
  n.external_id as nap_external_id,
  n.name as nap_name,
  s.id as current_station_id,
  s.source as current_source,
  s.external_id as current_external_id,
  s.name as current_name,
  round(st_distance(
    st_setsrid(st_makepoint(n.longitude, n.latitude), 4326)::geography,
    st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography
  )) as distance_m
from public.nap_staging_stations n
join public.charging_stations s
  on st_dwithin(
    st_setsrid(st_makepoint(n.longitude, n.latitude), 4326)::geography,
    st_setsrid(st_makepoint(s.longitude, s.latitude), 4326)::geography,
    75
  )
where n.batch_id = 'NAP_BATCH_ID'::uuid
order by distance_m, n.external_id;
