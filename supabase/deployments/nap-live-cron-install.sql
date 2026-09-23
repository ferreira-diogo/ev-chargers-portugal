-- Run after deploying and verifying the import-nap-availability Edge Function.
create extension if not exists pg_cron;
select cron.schedule(
  'nap-availability-every-15-minutes',
  '3,18,33,48 * * * *',
  $$select net.http_post(
    url := 'https://ftnmdgiftdgaycotjixr.supabase.co/functions/v1/import-nap-availability',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-nap-token',(select cron_token from private.nap_live_control where id=true)),
    timeout_milliseconds := 120000
  )$$
);
