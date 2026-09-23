-- Separate from the original importer installation: keep the token private.
alter table private.nap_live_control
  add column cron_token text not null default md5(gen_random_uuid()::text || gen_random_uuid()::text);

create function public.verify_nap_cron_token(p_token text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from private.nap_live_control
    where id=true and enabled=true and cron_token=p_token)
$$;
revoke all on function public.verify_nap_cron_token(text) from public,anon,authenticated;
grant execute on function public.verify_nap_cron_token(text) to service_role;
