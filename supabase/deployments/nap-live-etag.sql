-- Reduce repeated NAP downloads when the source has not changed.
-- The live function stores the public ETag only; no API key or token is stored.
create table if not exists private.nap_live_control_before_etag_20260923 as
select * from private.nap_live_control;

alter table private.nap_live_control
  add column if not exists source_etag text;

create or replace function public.get_nap_live_etag()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select source_etag from private.nap_live_control where id=true
$$;

create or replace function public.set_nap_live_etag(p_etag text)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  update private.nap_live_control
     set source_etag = nullif(left(p_etag, 512), '')
   where id=true
  returning true
$$;

revoke all on function public.get_nap_live_etag() from public, anon, authenticated;
revoke all on function public.set_nap_live_etag(text) from public, anon, authenticated;
grant execute on function public.get_nap_live_etag() to service_role;
grant execute on function public.set_nap_live_etag(text) to service_role;
