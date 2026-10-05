# Geographic destinations — 2026-10-05

Confirmed on the public site: `Bragança` selected `Distrito de Bragança, Portugal`.
The former resolver requested only one result and accepted its coordinates without
checking its geographic type. Map search and both route endpoints shared this code.

## Change

Web/PWA and the separate Android controller now use the same resolver asset.
It requests up to eight Portuguese matches with address/name details, favours an
exact settlement match, and requires a location choice for repeated names and
administrative-only matches. The choice displays the complete returned address and
warns that an administrative area has an approximate point. If a simple locality
name has no exact settlement in the first page, it retries as a structured city
query. It never silently substitutes a district or a generic municipality centre.
Portuguese city/town/village boundary results are accepted as settlements: the
live feed anchors the verified cities at their urban centres.

Village, hotel and street searches remain supported. No mainland bounding box is
used, so Madeira and the Azores remain searchable. Requests are serialized with
at least 1.1 seconds between starts, have a 12-second timeout and a bounded,
10-minute in-memory result cache. Ambiguous choices are not permanently memorized.
There is no new D1/KV endpoint, table, read or write for this resolver.

The PWA shell advances to v36 and loads the new resolver before the controller.
Android's build copies that same asset in its existing read-only assets step.
The isolation test accepts only the exact hashes of this authorized web change;
all other existing website files remain protected against Android changes.

## Validation

- `node --test ev-charge-portugal-github-ready/scripts/geocoding.test.mjs`
- Mobile/tablet chooser tests cover selection, cancellation, Escape and focus.
- Existing web syntax, live-map contract, location catalogue and Android recommendation tests.
- `Validate geographic search` workflow checks real destinations in Bragança,
  Leiria, Faro, Castelo Branco, Marinha Grande, Funchal and Ponta Delgada.
- Existing Android workflow checks the bundle/UI and produces a debug APK/AAB.
- Existing web deployment saves the previous Worker version and catalogue,
  checks the deployed version and snapshot, and rolls back if verification fails.

## Rollback

Pre-change source: `733b237a27f2fe89e73e8776a1633c8bb402d0df`, protected by
`backup/geocoding-before-20261005`. Revert only the geographic-search commit(s),
preserving subsequent independent changes. Let the existing deployment workflow
redeploy and verify the previous web source. For immediate web recovery, restore
the exact Worker version saved by the deployment's `catalogue-web-rollback-*`
artifact using the documented Wrangler rollback command in that workflow.
For Android, keep/use the previous APK or rebuild the backup branch. No database
restore or migration is required. No Play Store publication is performed here.
