-- Stop scheduled imports and restore the pre-live connector state.
-- Run the unschedule statement only if the named job exists.
begin;
select pg_advisory_xact_lock(20260922,1905);
update private.nap_live_control set enabled=false where id=true;
select cron.unschedule('nap-availability-every-15-minutes');
update public.connectors c set available_count=b.available_count,status=b.status,
  availability_updated_at=b.availability_updated_at,availability_source=b.availability_source,updated_at=b.updated_at
from private.connectors_before_nap_live_20260922 b where c.id=b.id and c.availability_source='mobie_nap';
-- Preserve collected history for audit. No stations/connectors are deleted.
commit;
-- Frontend rollback: restore index.html from commit eff0cb3de48d85a9951b71f6204f697a709561e7.
