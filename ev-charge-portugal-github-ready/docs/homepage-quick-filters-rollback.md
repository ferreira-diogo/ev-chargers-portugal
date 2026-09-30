# Homepage quick filters: backup and rollback

## Saved baseline

- Repository: `ferreira-diogo/ev-chargers-portugal`.
- Main before this change: `d3d116bffae5ba200b0cc49aefe4c9321bc44807`.
- Full backup branch: `backup/homepage-20260930-before-quick-filters`.
- Baseline tree: `ff591d98bb0a62faff5aa673ae6b90aa025c52f0`.

The backup includes the NAP availability retry fix merged earlier on 30 September.

## Change

The homepage has two quick-filter cards below a shorter map. Mobile stacks
the cards and puts each availability checkbox, colour dot and label on one
line. Desktop places the cards next to each other. Menu selections remain the
source of truth; the quick controls update the same selections and refresh
the map and station list immediately.

Clear resets only the quick-filter categories: all power ranges, no connector
restriction and all availability states. Search, location, operator and vehicle
are retained. The initial availability defaults remain unchanged.

The national map summary uses a small translucent background. Ver Portugal
remains clickable. The PWA shell uses cache v30, CSS v23 and JavaScript v29.

## Rollback

The existing Deploy ChargeVoy web workflow automatically runs `wrangler
rollback` if verification fails after deployment. This restores the preceding
web Worker version.

For a source rollback after merge, revert the squash commit of the homepage
quick-filters PR on a new branch, run `npm test`, and merge the revert. This
preserves unrelated changes made after the release. The revert also restores
the matching PWA shell and stylesheet/script versions.

To restore exactly the saved frontend baseline, run these commands in a clone
of the GitHub repository. Commit and merge the resulting branch through the
normal deployment workflow:

```sh
git fetch origin
git switch -c rollback/homepage-quick-filters origin/main
git restore --source=origin/backup/homepage-20260930-before-quick-filters -- \
  ev-charge-portugal-github-ready/index.html \
  ev-charge-portugal-github-ready/assets/chargevoy.css \
  ev-charge-portugal-github-ready/assets/chargevoy.js \
  ev-charge-portugal-github-ready/service-worker.js \
  ev-charge-portugal-github-ready/scripts/verify-web.mjs \
  ev-charge-portugal-github-ready/scripts/data-regressions.test.mjs
cd ev-charge-portugal-github-ready
npm test
npm run build:web
cd ..
git add ev-charge-portugal-github-ready
git commit -m "Revert homepage quick filters to saved 2026-09-30 baseline"
git push origin rollback/homepage-quick-filters
```

Verify the map, the existing menu filters, a station detail and route planner
on the public site after rollback. A frontend rollback does not modify the
database or the availability ingestion workflow.
