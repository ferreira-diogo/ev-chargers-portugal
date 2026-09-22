-- Rollback: preços oficiais MOBI.E/CEME (22-09-2026)
-- Remove apenas as tabelas criadas pela fase de preços.
-- O catálogo anterior public.tariffs não foi alterado.
-- Backup de segurança: private.tariffs_backup_20260922_price_close

begin;

do $$
begin
  if to_regclass('private.tariffs_backup_20260922_price_close') is null then
    raise exception 'Backup de tarifas não encontrado. Rollback cancelado.';
  end if;
end $$;

drop table if exists public.official_opc_tariffs;
drop table if exists public.ceme_cards;

commit;

-- Validação:
-- select to_regclass('public.official_opc_tariffs'), to_regclass('public.ceme_cards');
