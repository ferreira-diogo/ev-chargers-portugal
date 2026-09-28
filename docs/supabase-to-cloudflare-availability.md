# MOBI.E availability: Supabase scheduler → Cloudflare KV

## Current production boundary

- The D1 catalogue and website stay on Cloudflare.
- The existing Supabase `pg_cron` job calls `import-nap-availability` every five minutes and already parses/validates the NAP XML.
- With three optional secrets configured, that function also writes the validated station-point statuses to `mobie_nap_current` in Cloudflare KV. The API Workers continue to read that key.
- Do not remove the GitHub KV refresher until a full day of successful Supabase-to-KV writes and fresh API readings is observed. Never rely on both as permanent writers to the same KV key.

## Configuration

Create a Cloudflare API token scoped to **Workers KV Storage: Edit** for the ChargeVoy account. Add these three **Supabase Edge Function secrets** (never to the web app or repository):

- `CF_ACCOUNT_ID`: Cloudflare account ID.
- `CF_AVAILABILITY_KV_ID`: ID of the existing `chargevoy-availability` KV namespace.
- `CF_AVAILABILITY_KV_TOKEN`: token with KV write scope.

Deploy the updated `import-nap-availability` function, preserving its existing `x-nap-token` cron authorization. When all three secrets are present, it fetches the full XML even if the ETag is unchanged, validates the publication and 15,000+ statuses, imports to Supabase, and writes the same snapshot to KV. Partial secret configuration fails loudly. The old behavior remains active with none of the secrets.

Verify the function response includes `kv_points` (at least 15,000), then query `chargevoy-api` `/api/health` and `/api/stations?limit=300`: `availability_fresh` must be true and some connectors must have `availability_source: mobie_nap`. Repeat checks over several five-minute cycles. KV propagation can lag by up to a minute. After a day of fresh results, disable the GitHub `refresh-nap-availability` schedule while keeping its manual trigger as rollback.

## Rollback

Remove the three Supabase KV secrets, redeploy the previous Edge Function version if needed, and leave the GitHub refresh workflow active. No catalogue or user tables are changed by the KV publication code.
