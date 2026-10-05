# Station grouping rollout — 2026-10-05

Backup: branch `backup/station-grouping-before-20261005`, commit `ac563cf566c1749126c7d0e4546ab78324d628a2`.

Change: web and Android group official records using operator, address, city, distance and road direction. Nearby different names require at most 25 m; matching names allow at most 80 m. Every pair in a group must pass these rules. Ordinary street numbers remain distinct. Individual connector IDs and live readings remain unchanged. No database schema, data writes or cron changes.

Validation: both controllers covered by regression tests for Vila Real (two chargers/four CCS), Antuã numbered motorway addresses, Fátima, opposing directions, other operators, distinct house numbers, absent coordinates and neighbour chains. The national source audit must conserve every station membership and connector.

Web rollback:
1. Prefer the exact previous Worker version recorded in the deployment workflow artifact `catalogue-web-rollback-<run_id>`: use `wrangler rollback <worker-version> --config wrangler-deploy.toml`.
2. Revert the grouping PR on main and let Deploy ChargeVoy web publish the previous code. Increment the JS query version and service-worker cache version again when reverting so clients receive the restored code.
3. Verify Vila Real returns to the previous separate records and the national catalogue remains available. Do not reset main or restore unrelated files.

Android rollback:
- Preserve the APK from the last successful Android test build before this change. It is the previous installation artifact; existing phones keep that version until installing this update.
- For a corrective update, revert only this PR's Android changes, retain signing identity and application ID, and build with a versionCode greater than the installed version. Keep app data and favourites; do not instruct users to uninstall.
- New build artifact contains the corrected APK and AAB. No app store publication occurs in this change.

Triggers: merged opposite road directions, missing connectors/members, wrong per-charger live totals, failed map load or browser/Android regression. Production workflow automatically restores the exact previous Worker if deployment verification fails.
