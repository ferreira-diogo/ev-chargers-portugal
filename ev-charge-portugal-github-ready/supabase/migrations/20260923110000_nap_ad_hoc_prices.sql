-- ChargeVoy: price components published in the official MOBI.E NAP live feed.
-- Safety backup: no existing data is changed by this migration.  The two current
-- pricing sources are copied so the pre-feature state can be inspected/restored.
create schema if not exists backups;

create table if not exists backups.official_opc_tariffs_before_nap_ad_hoc_20260923 as
  table public.official_opc_tariffs;
create table if not exists backups.tariffs_before_nap_ad_hoc_20260923 as
  table public.tariffs;

create table if not exists public.station_ad_hoc_price_components (
  station_id uuid not null references public.charging_stations(id) on delete cascade,
  point_id text not null,
  pricing_policy text not null,
  rate_index integer not null default 0,
  amount_eur numeric not null check (amount_eur >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  valid_from timestamptz,
  observed_at timestamptz not null,
  source text not null default 'mobie_nap',
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (station_id, point_id, pricing_policy, rate_index)
);

comment on table public.station_ad_hoc_price_components is
  'Official ad hoc price components published by MOBI.E NAP. These are direct-charge prices, not CEME card estimates.';

create index if not exists station_ad_hoc_price_components_station_observed_idx
  on public.station_ad_hoc_price_components (station_id, observed_at desc);

alter table public.station_ad_hoc_price_components enable row level security;
grant select on public.station_ad_hoc_price_components to anon, authenticated;

drop policy if exists "Public read ad hoc price components" on public.station_ad_hoc_price_components;
create policy "Public read ad hoc price components"
  on public.station_ad_hoc_price_components for select to anon, authenticated using (true);

create or replace function public.import_nap_ad_hoc_prices(
  p_publication_time timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_upserted integer;
  v_matched integer;
begin
  perform pg_advisory_xact_lock(20260923, 1100);
  if p_publication_time is null
    or p_publication_time < now() - interval '45 minutes'
    or p_publication_time > now() + interval '5 minutes' then
    raise exception 'Expired or invalid price publication time';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 100000 then
    raise exception 'Invalid price feed size';
  end if;

  create temporary table nap_price_input on commit drop as
    select * from jsonb_to_recordset(p_rows) as r(
      site_id text, point_id text, pricing_policy text, rate_index integer,
      amount_eur numeric, currency text, valid_from timestamptz, raw_data jsonb
    );
  if exists (
    select 1 from pg_temp.nap_price_input
    where nullif(site_id, '') is null or nullif(point_id, '') is null
      or nullif(pricing_policy, '') is null or rate_index is null
      or amount_eur is null or amount_eur < 0
      or coalesce(currency, 'EUR') !~ '^[A-Z]{3}$'
  ) then
    raise exception 'Invalid price row';
  end if;

  create temporary table nap_price_values on commit drop as
  select distinct on (l.station_id, p.point_id, p.pricing_policy, p.rate_index)
    l.station_id, p.point_id, p.pricing_policy, p.rate_index, p.amount_eur,
    coalesce(p.currency, 'EUR') as currency, p.valid_from, p.raw_data
  from pg_temp.nap_price_input p
  join public.station_source_links l
    on l.source = 'nap' and l.external_id = p.site_id
  join public.nap_staging_connectors sc
    on sc.batch_id = (l.metadata->>'batch_id')::uuid
    and sc.station_external_id = l.external_id
    and sc.raw_data->>'refill_point_id' = p.point_id
  order by l.station_id, p.point_id, p.pricing_policy, p.rate_index, p.valid_from desc nulls last;

  select count(*) into v_matched from pg_temp.nap_price_values;
  if v_matched = 0 then
    raise exception 'No price rows matched the active NAP station links';
  end if;

  insert into public.station_ad_hoc_price_components (
    station_id, point_id, pricing_policy, rate_index, amount_eur, currency,
    valid_from, observed_at, source, raw_data, updated_at
  )
  select station_id, point_id, pricing_policy, rate_index, amount_eur, currency,
    valid_from, p_publication_time, 'mobie_nap', raw_data, now()
  from pg_temp.nap_price_values
  on conflict (station_id, point_id, pricing_policy, rate_index) do update set
    amount_eur = excluded.amount_eur,
    currency = excluded.currency,
    valid_from = excluded.valid_from,
    observed_at = excluded.observed_at,
    source = excluded.source,
    raw_data = excluded.raw_data,
    updated_at = now();
  get diagnostics v_upserted = row_count;

  return jsonb_build_object('matched_components', v_matched, 'upserted_components', v_upserted,
    'publication_time', p_publication_time);
end;
$$;

revoke all on function public.import_nap_ad_hoc_prices(timestamptz, jsonb) from public;
grant execute on function public.import_nap_ad_hoc_prices(timestamptz, jsonb) to service_role;
