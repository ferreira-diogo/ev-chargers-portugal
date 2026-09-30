# NAP availability retry release — backup and rollback

## Saved baseline

- Backup branch: [backup/nap-availability-20260930-1301](https://github.com/ferreira-diogo/ev-chargers-portugal/tree/backup/nap-availability-20260930-1301).
- Baseline commit: `4d6536b7cdd7d2cb2a8100fc465898cdb75b5ed4`.
- The branch preserves the complete repository before this release.

## Released behavior

The existing five-minute schedule is retained. The refresh downloads and validates the complete MOBI.E XML up to three times, waiting 10 and 30 seconds between attempts. Each source request has a 60-second limit, and the entire refresh has a four-minute budget. Each Cloudflare request has a 15-second limit within the same budget.

The previous snapshot is preserved if all source attempts fail. Cloudflare is contacted only after successful XML, coverage, timestamp, and applicable Content-Length validation. A successful refresh makes one KV snapshot write. The NAP parser and its existing validation thresholds are unchanged.

The workflow runs the parser and retry regression tests before refreshing. Pull requests run these tests without credentials or a snapshot write, in a separate concurrency group. The job has a six-minute safety timeout, including setup and dependency installation.

Logs include `nap_source_attempt_failed`, `nap_source_retry`, `nap_source_verified`, and `kv_snapshot_written`, with byte counts, HTTP status, attempt number, and duration. Final failures still fail the job instead of reporting a false success.

## When to roll back

Roll back if the new script causes repeated failures despite a complete, current source feed; fails its regression tests; or publishes data that does not meet the existing validation rules. An upstream outage alone is not evidence of a regression: all three attempts may legitimately fail, leaving the previous snapshot in place.

## Check and apply

From a clean checkout containing this release:

```bash
bash ev-charge-portugal-github-ready/scripts/rollback-nap-availability-20260930.sh --check
bash ev-charge-portugal-github-ready/scripts/rollback-nap-availability-20260930.sh --apply
git diff --cached
git commit -m "Roll back NAP availability retries to saved baseline"
```

Publish that commit through the normal main-branch release process. The existing push trigger starts the restored refresh workflow. Check its run result and `https://chargevoy-api.zombid.workers.dev/api/availability`; verify the publication timestamp and at least 15,000 status entries.

The rollback restores only the workflow and refresh script and removes the new retry test file. It keeps this recovery guide and helper, and preserves unrelated repository changes. It never force-resets main, changes the five-minute cadence, or restores an older snapshot over newer valid availability data. No schema, database migration, binding, secret, API Worker, or website asset is changed by this release or rollback.
