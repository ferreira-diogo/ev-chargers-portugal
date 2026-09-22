-- Rollback: catálogo europeu de veículos (22-09-2026)
-- Executar apenas se for necessário regressar ao estado anterior à importação.
-- Backup de origem: private.vehicle_models_backup_20260922
-- Esta transação remove o catálogo Gaia EVDB e repõe exatamente as colunas/dados anteriores.

begin;

do $$
begin
  if to_regclass('private.vehicle_models_backup_20260922') is null then
    raise exception 'Backup private.vehicle_models_backup_20260922 não encontrado. Rollback cancelado.';
  end if;
end $$;

delete from public.vehicle_models;

insert into public.vehicle_models (
  id, make, model, variant, model_year_start, model_year_end,
  battery_capacity_kwh, consumption_wh_km, wltp_range_km,
  max_ac_power_kw, max_dc_power_kw, connector_types,
  active, created_at, updated_at
)
select
  id, make, model, variant, model_year_start, model_year_end,
  battery_capacity_kwh, consumption_wh_km, wltp_range_km,
  max_ac_power_kw, max_dc_power_kw, connector_types,
  active, created_at, updated_at
from private.vehicle_models_backup_20260922;

alter table public.vehicle_models
  drop constraint if exists vehicle_models_external_id_key,
  drop column if exists external_id,
  drop column if exists source,
  drop column if exists body_style,
  drop column if exists data_quality,
  drop column if exists source_url,
  drop column if exists consumption_basis;

do $$
declare restored_count integer;
begin
  select count(*) into restored_count from public.vehicle_models;
  if restored_count <> 1 then
    raise exception 'Validação falhou: esperado 1 veículo restaurado, obtidos %.', restored_count;
  end if;
end $$;

commit;

-- Validação final:
-- select id, make, model, variant from public.vehicle_models;
