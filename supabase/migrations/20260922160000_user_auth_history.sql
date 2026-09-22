create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.charging_stations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, station_id)
);

create table if not exists public.user_route_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_label text not null,
  origin_lat double precision not null,
  origin_lon double precision not null,
  destination_label text not null,
  destination_lat double precision not null,
  destination_lon double precision not null,
  vehicle_id uuid references public.vehicle_models(id) on delete set null,
  stops jsonb not null default '[]'::jsonb,
  distance_km numeric(10,2),
  drive_minutes integer,
  charging_minutes integer,
  created_at timestamptz not null default now()
);

create index if not exists user_route_history_user_created_idx on public.user_route_history(user_id, created_at desc);
alter table public.user_favorites enable row level security;
alter table public.user_route_history enable row level security;

create policy "Users manage own favorites" on public.user_favorites for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users read own route history" on public.user_route_history for select to authenticated
using ((select auth.uid()) = user_id);
create policy "Users insert own route history" on public.user_route_history for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "Users delete own route history" on public.user_route_history for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, delete on public.user_favorites to authenticated;
grant select, insert, delete on public.user_route_history to authenticated;
revoke all on public.user_favorites from anon;
revoke all on public.user_route_history from anon;
