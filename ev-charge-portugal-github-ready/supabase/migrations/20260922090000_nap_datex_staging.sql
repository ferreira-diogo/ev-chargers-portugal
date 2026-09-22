-- NAP Portugal DATEX II: isolated import/audit structures.
-- Public website roles have no access; writes are service-role only.

create table if not exists public.nap_import_runs (
  batch_id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_etag text,
  publication_time timestamptz,
  status text not null default 'started'
    check (status in ('started', 'staged', 'validated', 'promoted', 'failed', 'rolled_back')),
  dry_run boolean not null default true,
  source_sites integer,
  source_refill_points integer,
  staged_sites integer not null default 0,
  staged_connectors integer not null default 0,
  invalid_sites integer not null default 0,
  validation jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.nap_staging_stations (
  batch_id uuid not null references public.nap_import_runs(batch_id) on delete cascade,
  external_id text not null,
  operator_external_id text,
  operator_name text,
  name text,
  address text,
  city text,
  postal_code text,
  country_code text not null default 'PT',
  latitude double precision not null,
  longitude double precision not null,
  max_power_kw numeric,
  accessibility text,
  source_updated_at timestamptz,
  source_hash text not null,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  primary key (batch_id, external_id),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180),
  check (max_power_kw is null or max_power_kw >= 0)
);

create table if not exists public.nap_staging_connectors (
  batch_id uuid not null,
  station_external_id text not null,
  external_id text not null,
  type text not null,
  power_kw numeric,
  quantity integer not null default 1,
  status text not null default 'unknown',
  source_hash text not null,
  raw_data jsonb,
  created_at timestamptz not null default now(),
  primary key (batch_id, external_id),
  foreign key (batch_id, station_external_id)
    references public.nap_staging_stations(batch_id, external_id)
    on delete cascade,
  check (power_kw is null or power_kw >= 0),
  check (quantity > 0),
  check (status in ('available', 'occupied', 'unavailable', 'unknown'))
);

create table if not exists public.station_source_links (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.charging_stations(id) on delete cascade,
  source text not null,
  external_id text not null,
  source_url text,
  source_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (source, external_id)
);

create index if not exists nap_import_runs_status_started_idx
  on public.nap_import_runs(status, started_at desc);
create index if not exists nap_staging_stations_batch_idx
  on public.nap_staging_stations(batch_id);
create index if not exists nap_staging_stations_coords_idx
  on public.nap_staging_stations(latitude, longitude);
create index if not exists nap_staging_connectors_station_idx
  on public.nap_staging_connectors(batch_id, station_external_id);
create index if not exists station_source_links_station_idx
  on public.station_source_links(station_id);

alter table public.nap_import_runs enable row level security;
alter table public.nap_staging_stations enable row level security;
alter table public.nap_staging_connectors enable row level security;
alter table public.station_source_links enable row level security;

revoke all on public.nap_import_runs from anon, authenticated;
revoke all on public.nap_staging_stations from anon, authenticated;
revoke all on public.nap_staging_connectors from anon, authenticated;
revoke all on public.station_source_links from anon, authenticated;

grant all on public.nap_import_runs to service_role;
grant all on public.nap_staging_stations to service_role;
grant all on public.nap_staging_connectors to service_role;
grant all on public.station_source_links to service_role;

comment on table public.nap_import_runs is 'Audit log for NAP Portugal DATEX II imports';
comment on table public.nap_staging_stations is 'Isolated NAP station staging; never queried by the public website';
comment on table public.nap_staging_connectors is 'Isolated NAP connector staging; never queried by the public website';
comment on table public.station_source_links is 'Maps canonical stations to identifiers from multiple source datasets';
