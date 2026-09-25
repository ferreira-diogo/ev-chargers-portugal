# Cloudflare D1 fallback

This database is a read-only public cache of charging stations. It must never contain
authentication, favorites, reviews, tokens or private user data.

## One-time Cloudflare setup

1. Create a D1 database called `chargevoy-fallback`.
2. Bind it to the production Worker/Pages project as `CHARGEVOY_DB`.
3. Keep the binding read-only from the public site. Only the GitHub Action writes snapshots.

## GitHub Actions secrets

Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`: token with D1 edit permission only;
- `CLOUDFLARE_ACCOUNT_ID`;
- `D1_DATABASE_NAME`: `chargevoy-fallback`;
- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`: never put this in frontend code.

The scheduled workflow runs every six hours and can also be started manually. It uses a
two-table staging/promote process: if Supabase or the sync fails, the last valid D1
snapshot remains available.

The frontend calls `/api/stations` only after Supabase fails. The endpoint returns at
most 500 stations, preferably within the user's approximate area. D1 data is a
fallback and may be stale; Supabase remains the source of truth.
