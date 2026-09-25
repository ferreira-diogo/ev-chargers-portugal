-- ChargeVoy D1 public catalog.
-- Public/read-only data only. Authentication, favorites and private history stay outside D1.

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

CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  external_id TEXT,
  source TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY NOT NULL,
  station_id TEXT NOT NULL,
  type TEXT,
  power_kw REAL,
  quantity INTEGER,
  available_count INTEGER,
  status TEXT,
  availability_updated_at TEXT,
  availability_source TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS vehicle_models (
  id TEXT PRIMARY KEY NOT NULL,
  external_id TEXT,
  source TEXT,
  make TEXT,
  model TEXT,
  variant TEXT,
  model_year_start INTEGER,
  model_year_end INTEGER,
  battery_capacity_kwh REAL,
  consumption_wh_km REAL,
  wltp_range_km REAL,
  max_ac_power_kw REAL,
  max_dc_power_kw REAL,
  connector_types TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  body_style TEXT,
  data_quality TEXT,
  consumption_basis TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ceme_cards (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  energy_price_eur_kwh REAL,
  session_fee_eur REAL,
  includes_tar INTEGER,
  vat_rate REAL,
  iec_eur_kwh REAL,
  conditions TEXT,
  source_url TEXT,
  valid_from TEXT,
  valid_to TEXT,
  pricing_mode TEXT,
  network_scope TEXT,
  cashback_own_rate REAL,
  cashback_other_rate REAL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS station_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  station_id TEXT NOT NULL,
  rating REAL,
  comment TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS station_reliability (
  station_id TEXT PRIMARY KEY NOT NULL,
  review_count INTEGER DEFAULT 0,
  average_rating REAL,
  snapshot_count INTEGER DEFAULT 0,
  availability_rate REAL,
  last_observed_at TEXT
);

CREATE TABLE IF NOT EXISTS official_opc_tariffs (
  id TEXT PRIMARY KEY NOT NULL,
  station_id TEXT NOT NULL,
  connector_uid TEXT,
  voltage_level TEXT,
  tariff_period TEXT,
  connector_type TEXT,
  power_kw REAL,
  activation_fee_eur REAL,
  energy_price_eur_kwh REAL,
  time_price_eur_min REAL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS station_ad_hoc_price_components (
  id TEXT PRIMARY KEY NOT NULL,
  station_id TEXT NOT NULL,
  point_id TEXT,
  pricing_policy TEXT,
  amount_eur REAL,
  currency TEXT DEFAULT 'EUR',
  observed_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS station_cache_latitude_idx ON station_cache(latitude);
CREATE INDEX IF NOT EXISTS station_cache_longitude_idx ON station_cache(longitude);
CREATE INDEX IF NOT EXISTS station_cache_power_idx ON station_cache(max_power_kw DESC);
CREATE INDEX IF NOT EXISTS connectors_station_idx ON connectors(station_id);
CREATE INDEX IF NOT EXISTS tariffs_station_idx ON official_opc_tariffs(station_id);
CREATE INDEX IF NOT EXISTS adhoc_station_idx ON station_ad_hoc_price_components(station_id);
CREATE INDEX IF NOT EXISTS reviews_station_idx ON station_reviews(station_id);
CREATE INDEX IF NOT EXISTS vehicles_active_make_idx ON vehicle_models(active, make, model);
