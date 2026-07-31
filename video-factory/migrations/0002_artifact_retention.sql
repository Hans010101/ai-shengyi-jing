ALTER TABLE jobs ADD COLUMN retention_until TEXT;
ALTER TABLE jobs ADD COLUMN artifacts_deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_retention
ON jobs(status, retention_until, artifacts_deleted_at);
