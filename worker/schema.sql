PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('topup','spend','refund','bonus','adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON points_ledger(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS point_packages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  points INTEGER NOT NULL CHECK(points > 0),
  price_minor INTEGER NOT NULL CHECK(price_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO point_packages(code,name,points,price_minor,currency,sort_order) VALUES
('starter','Starter',500,500,'USD',1),
('creator','Creator',1500,1200,'USD',2),
('pro','Pro',4000,2500,'USD',3),
('studio','Studio',10000,5000,'USD',4);
CREATE TABLE IF NOT EXISTS topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL REFERENCES point_packages(code),
  reference TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS topups_user_idx ON topups(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Video',
  status TEXT NOT NULL DEFAULT 'draft',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS processing_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  points_cost INTEGER NOT NULL DEFAULT 0,
  input_key TEXT,
  output_key TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Admin dashboard extensions (included for fresh database installs).
-- Existing installations should run worker/admin-migration.sql instead.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at DESC);

