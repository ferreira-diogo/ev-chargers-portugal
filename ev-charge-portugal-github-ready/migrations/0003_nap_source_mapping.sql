CREATE TABLE IF NOT EXISTS nap_connector_mapping (
  site_id TEXT NOT NULL,
  point_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  connector_id TEXT,
  source TEXT NOT NULL DEFAULT 'mobie-nap',
  match_method TEXT NOT NULL DEFAULT 'explicit',
  confidence REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site_id, point_id, station_id, connector_id)
);

CREATE INDEX IF NOT EXISTS idx_nap_connector_mapping_station
  ON nap_connector_mapping(station_id);

CREATE INDEX IF NOT EXISTS idx_nap_connector_mapping_connector
  ON nap_connector_mapping(connector_id);

CREATE INDEX IF NOT EXISTS idx_nap_connector_mapping_nap
  ON nap_connector_mapping(site_id, point_id);
