-- Rollback for 20260924100000_security_performance_hardening.sql.
-- Run only with an approved rollback decision.

drop index if exists public.availability_snapshots_connector_id_idx;
drop index if exists public.connectors_station_id_idx;
drop index if exists public.tariffs_connector_id_idx;
drop index if exists public.user_favorites_station_id_idx;
drop index if exists public.user_route_history_vehicle_id_idx;

create or replace function public.set_station_geom()
returns trigger
language plpgsql
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

-- This restores the previous grant state. Keep this operation restricted to a
-- controlled rollback because it also restores the prior security warning.
grant all on function public.rls_auto_enable() to public;
