begin;

delete from public.ceme_cards where id = 'myatlante';

alter table public.ceme_cards
  drop constraint if exists ceme_cards_pricing_mode_check;

alter table public.ceme_cards
  drop column if exists cashback_other_rate,
  drop column if exists cashback_own_rate,
  drop column if exists network_scope,
  drop column if exists pricing_mode;

commit;

-- Para reposição integral dos cinco registos anteriores, se necessário:
-- truncate table public.ceme_cards;
-- insert into public.ceme_cards select * from private.ceme_cards_backup_20260922_myatlante;
