# NAP Portugal DATEX II import

The NAP feed is treated as the authoritative static infrastructure source. Imports are
isolated in staging and never modify the public station tables automatically.

## Safety model

- Every production table was snapshotted before the NAP schema migration.
- Scheduled runs use the HTTP `ETag` and stop on `304 Not Modified`.
- A feed with fewer than 8,000 sites or 17,000 connectors fails closed.
- Duplicate IDs, invalid Portuguese coordinates and orphan connectors fail the run.
- Staging tables have RLS enabled and no public policies.
- Promotion into `charging_stations` is deliberately not automatic; candidate matches
  within 75 metres must be reviewed first.

## GitHub repository secrets

Configure these in **Settings → Secrets and variables → Actions**:

- `SUPABASE_URL`: the project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service role key. Never place it in
  `index.html`, logs, commits, or a Cloudflare public environment variable.

## First run

1. Open **Actions → NAP DATEX II audit → Run workflow**.
2. Select `dry-run` and confirm the expected totals.
3. Run again with `stage`.
4. Copy the returned `batch_id`.
5. Replace `NAP_BATCH_ID` in `supabase/validation/validate-nap-staging.sql` and run it.
6. Review all candidate matches before creating a promotion migration.

Scheduled runs execute every six hours. If the `ETag` is unchanged, no file is
downloaded and no database rows are written.

## Local validation

```bash
npm ci
node scripts/import-nap-datex.mjs --dry-run --file=/path/to/evChargingInfra.data
```

## Staging rollback

Replace `NAP_BATCH_ID` in `supabase/rollback/rollback-nap-staging.sql`. The rollback
deletes only the selected import run and its staging rows. It cannot delete public
stations or connectors.

## Production backup

An immutable pre-NAP snapshot was created and verified in the private database backup
schema before these structures were introduced. Backup identifiers and production
row counts are intentionally not published in this public repository.
