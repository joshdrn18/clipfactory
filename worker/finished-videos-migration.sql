-- Permanent finished video library. Run this once against clipfactory-db.
CREATE TABLE IF NOT EXISTS finished_videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_project_id TEXT,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'video/mp4',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS finished_videos_user_idx
  ON finished_videos(user_id, created_at DESC);

-- Recover every export already uploaded before the permanent gallery existed.
INSERT OR IGNORE INTO finished_videos
  (id,user_id,source_project_id,file_name,object_key,size_bytes,content_type,created_at)
SELECT id,user_id,project_id,file_name,object_key,size_bytes,content_type,created_at
FROM media_assets
WHERE kind='export';
