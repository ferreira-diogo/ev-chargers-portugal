PRAGMA foreign_keys = ON;
CREATE TABLE users (id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE, email TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, station_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id, station_id));
CREATE TABLE challenges (nonce_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX challenges_expiry ON challenges(expires_at);
