-- Run after deploying and verifying the import-nap-availability Edge Function.
-- The source feed is polled every 5 minutes. The importer only applies a
-- new publication and ignores repeated snapshots, so this does not create
-- duplicate availability history when MOBI.E has not published new data.
create extension if not exists pg_cron;
select cron.schedule(
  'nap-availability-every-15-minutes',
  '*/5 * * * *',
  $$select net.http_post(
    url := 'https://ftnmdgiftdgaycotjixr.supabase.co/functions/v1/import-nap-availability',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-nap-token',(select cron_token from private.nap_live_control where id=true)),
    timeout_milliseconds := 120000
  )$$
);
