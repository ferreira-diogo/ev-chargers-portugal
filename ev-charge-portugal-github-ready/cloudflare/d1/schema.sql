-- ChargeVoy D1 read-only fallback catalog.
-- No authentication, favorites, reviews or private user data belongs here.

CREATE TABLE IF NOT EXISTS station_cache (
  id TEXT PRIMARY KEY NOT NULL,
  external_id TEXT,
  source TEXT,
  name TEXT,
  address TEXT,
  city TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  max_power_kw REAL,
  status TEXT,
  operator_id TEXT,
  amenities TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS station_cache_latitude_idx
  ON station_cache(latitude);

CREATE INDEX IF NOT EXISTS station_cache_longitude_idx
  ON station_cache(longitude);

CREATE INDEX IF NOT EXISTS station_cache_power_idx
  ON station_cache(max_power_kw DESC);
