CREATE TABLE account_route_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin_label TEXT NOT NULL, destination_label TEXT NOT NULL,
  distance_km REAL NOT NULL, charging_minutes INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX account_history_user ON account_route_history(user_id, created_at);
CREATE TABLE account_station_reviews (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  station_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT, created_at TEXT NOT NULL, UNIQUE(user_id, station_id)
);
CREATE INDEX account_reviews_station ON account_station_reviews(station_id, created_at);
