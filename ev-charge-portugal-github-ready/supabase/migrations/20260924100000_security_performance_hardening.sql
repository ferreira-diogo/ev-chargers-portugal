-- ChargeVoy security and performance hardening.
-- No application rows are changed. All statements are reversible through the
-- matching rollback script.

create index if not exists availability_snapshots_connector_id_idx
  on public.availability_snapshots (connector_id);

create index if not exists connectors_station_id_idx
  on public.connectors (station_id);

create index if not exists tariffs_connector_id_idx
  on public.tariffs (connector_id);

create index if not exists user_favorites_station_id_idx
  on public.user_favorites (station_id);

create index if not exists user_route_history_vehicle_id_idx
  on public.user_route_history (vehicle_id);

create or replace function public.set_station_geom()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public'
as $function$
begin
  if new.latitude is not null and new.longitude is not null then
    new.geom := gis.ST_SetSRID(
      gis.ST_MakePoint(new.longitude, new.latitude),
      4326
    )::gis.geography;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.rls_auto_enable() from public;
