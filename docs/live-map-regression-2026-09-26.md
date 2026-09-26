# Live map regression validation — 2026-09-26

## Root cause

The API Worker correctly enriched connectors with fresh MOBI.E/NAP states using `availability_source` values such as `mobie_nap_d1_mapping`, while the browser considered a connector live only when `availability_source === "mobie_nap"`. As a result, valid `available_count` readings were discarded and stations could not become green.

The site Worker also treated the browser's latitude/longitude hint as a hard catalogue bounding box. That left `allStations` with only a local subset, which removed major stations elsewhere in Portugal and weakened long-distance route planning.

## Fix

The public site Worker now normalizes fresh mapped NAP readings to the stable browser contract `mobie_nap` and keeps stale readings as `mobie_nap_stale`. Explicit min/max bounds remain available for route/corridor requests.

The initial station catalogue is now the 1,500 highest-power stations nationally even when the browser supplies a location hint. The browser can still filter/sort around a chosen location, while route planning retains a national high-power candidate set.

## Regression gates

`npm test` now includes `verify-live-map-contract.mjs`, covering the live-source contract, green-marker mapping, national catalogue behavior, explicit bounds, stale-state behavior, and route-planner access to the station catalogue. The PR workflow also runs the existing web regression suite and `build:web`.

## Rollback

The existing rollback baseline remains unchanged: `rollback/pre-station-photos-live-xml`.
