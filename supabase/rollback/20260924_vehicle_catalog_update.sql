-- Rollback: atualização do catálogo de veículos (24-09-2026)
-- Backup criado antes da importação: private.vehicle_models_backup_20260924
-- Executar apenas se for necessário regressar ao estado anterior à atualização.

begin;

do $$
begin
  if to_regclass('private.vehicle_models_backup_20260924') is null then
    raise exception 'Backup private.vehicle_models_backup_20260924 não encontrado. Rollback cancelado.';
  end if;
end $$;

delete from public.vehicle_models;

insert into public.vehicle_models (
  id, make, model, variant, model_year_start, model_year_end,
  battery_capacity_kwh, consumption_wh_km, wltp_range_km,
  max_ac_power_kw, max_dc_power_kw, connector_types,
  active, created_at, updated_at, external_id, source,
  body_style, data_quality, source_url, consumption_basis
)
select
  id, make, model, variant, model_year_start, model_year_end,
  battery_capacity_kwh, consumption_wh_km, wltp_range_km,
  max_ac_power_kw, max_dc_power_kw, connector_types,
  active, created_at, updated_at, external_id, source,
  body_style, data_quality, source_url, consumption_basis
from private.vehicle_models_backup_20260924;

do $$
declare restored_count integer;
begin
  select count(*) into restored_count from public.vehicle_models;
  if restored_count <> 369 then
    raise exception 'Validação falhou: esperado 369 veículos restaurados, obtidos %.', restored_count;
  end if;
end $$;

commit;

-- Validação final:
-- select count(*) from public.vehicle_models;
