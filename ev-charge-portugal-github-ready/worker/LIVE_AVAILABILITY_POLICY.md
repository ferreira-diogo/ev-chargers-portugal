# Live availability freshness

The Cloudflare live availability path must treat NAP/MOBI.E data older than 5 minutes as stale/unknown.

Target architecture:

NAP MOBI.E -> refresh worker/workflow -> Cloudflare KV (`mobie_nap_current`) -> Worker API -> frontend.

Policy:
- refresh target: every 5 minutes;
- maximum age shown as live: 5 minutes;
- snapshots older than 5 minutes must not be represented as current availability;
- retain the last snapshot for diagnostics/fallback metadata, but expose its connector availability as unknown/stale;
- D1 remains the station/connector catalogue and mapping store; KV is the fast current availability snapshot.

Rollback baseline before this policy change: `8cd1f5bcaa2c51fc927e5f5f8519f42a1eb328e8`.
