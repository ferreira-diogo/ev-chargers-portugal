-- Additive, confined to ACCOUNTS_DB. Old Worker and existing sessions remain compatible.
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  data TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(data)),
  updated_at INTEGER NOT NULL
);
