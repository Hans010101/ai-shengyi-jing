ALTER TABLE jobs ADD COLUMN project_id TEXT;
ALTER TABLE jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'ai-shengyi-case';
ALTER TABLE jobs ADD COLUMN source_title TEXT;
ALTER TABLE jobs ADD COLUMN source_payload TEXT;
ALTER TABLE jobs ADD COLUMN options TEXT;
ALTER TABLE jobs ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_payload TEXT NOT NULL,
  options TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_key TEXT,
  script_key TEXT,
  storyboard_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_versions_project ON project_versions(project_id, version DESC);

INSERT OR IGNORE INTO template_versions(id, version, status, config, created_at) VALUES
('knowledge-director-v1','2.0.0','active','{"sourceTypes":["text","topic","article","book"],"visualPreset":"smart-director","ratio":"9:16","durationSeconds":60,"qualityGates":["facts","script","narration","captions","sync","spec"]}',CURRENT_TIMESTAMP),
('ai-shengyi-case-v1','2.0.0','active','{"sourceTypes":["ai-shengyi-case"],"visualPreset":"real-montage","ratio":"9:16","durationSeconds":90,"minAssets":3}',CURRENT_TIMESTAMP);
