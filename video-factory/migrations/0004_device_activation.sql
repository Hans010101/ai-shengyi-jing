CREATE TABLE IF NOT EXISTS activation_codes (
  code_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'owner-device',
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_expiry
  ON activation_codes(expires_at, used_at);
