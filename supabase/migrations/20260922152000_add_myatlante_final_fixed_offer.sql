create schema if not exists private;

drop table if exists private.ceme_cards_backup_20260922_myatlante;
create table private.ceme_cards_backup_20260922_myatlante as
select * from public.ceme_cards;

alter table public.ceme_cards
  add column if not exists pricing_mode text not null default 'component',
  add column if not exists network_scope text,
  add column if not exists cashback_own_rate numeric(6,5),
  add column if not exists cashback_other_rate numeric(6,5);

alter table public.ceme_cards
  drop constraint if exists ceme_cards_pricing_mode_check;

alter table public.ceme_cards
  add constraint ceme_cards_pricing_mode_check
  check (pricing_mode in ('component', 'final_fixed'));

insert into public.ceme_cards (
  id, name, energy_price_eur_kwh, session_fee_eur, includes_tar, vat_rate,
  iec_eur_kwh, conditions, source_url, valid_from, valid_to, active, updated_at,
  pricing_mode, network_scope, cashback_own_rate, cashback_other_rate
) values (
  'myatlante', 'myAtlante', 0.49, 0, true, 0,
  0,
  'Campanha oficial: preço final fixo para sessões elegíveis rápidas/ultrarrápidas iniciadas pela app ou cartão RFID myAtlante. Green Gems são crédito futuro e não são deduzidas ao pagamento atual.',
  'https://atlante.energy/pt-pt/noticias/campanha-de-verao-2026-atlante/',
  '2026-07-01', '2026-09-30', true, now(),
  'final_fixed',
  'Portugal: rede Atlante e redes de terceiros disponíveis na app',
  0.50, 0.20
)
on conflict (id) do update set
  name = excluded.name,
  energy_price_eur_kwh = excluded.energy_price_eur_kwh,
  session_fee_eur = excluded.session_fee_eur,
  includes_tar = excluded.includes_tar,
  vat_rate = excluded.vat_rate,
  iec_eur_kwh = excluded.iec_eur_kwh,
  conditions = excluded.conditions,
  source_url = excluded.source_url,
  valid_from = excluded.valid_from,
  valid_to = excluded.valid_to,
  active = excluded.active,
  updated_at = excluded.updated_at,
  pricing_mode = excluded.pricing_mode,
  network_scope = excluded.network_scope,
  cashback_own_rate = excluded.cashback_own_rate,
  cashback_other_rate = excluded.cashback_other_rate;

grant select on public.ceme_cards to anon, authenticated;
alter table public.ceme_cards enable row level security;
