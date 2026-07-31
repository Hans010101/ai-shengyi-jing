CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  case_id TEXT NOT NULL,
  case_name TEXT,
  template_id TEXT NOT NULL DEFAULT 'editorial-v1',
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  attempt INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  error_code TEXT,
  error_message TEXT,
  output_key TEXT,
  poster_key TEXT,
  audio_key TEXT,
  manifest_key TEXT,
  qa_key TEXT,
  qa_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, id);

CREATE TABLE IF NOT EXISTS template_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO template_versions(id, version, status, config, created_at)
VALUES(
  'editorial-v1',
  '1.0.0',
  'active',
  '{"ratio":"9:16","width":1080,"height":1920,"fps":30,"minAssets":3,"maxAssets":8,"targetDurationSeconds":90}',
  CURRENT_TIMESTAMP
);
