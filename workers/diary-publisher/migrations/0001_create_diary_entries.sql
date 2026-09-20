PRAGMA foreign_keys = ON;

CREATE TABLE diary_entries (
  entry_date TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0,
  ready_version INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  publish_started_at TEXT,
  published_at TEXT,
  page_url TEXT,
  commit_url TEXT,
  commit_sha TEXT,
  last_error TEXT,
  CHECK (ready IN (0, 1)),
  CHECK (status IN ('draft', 'publishing', 'published', 'failed'))
);

CREATE TABLE diary_photos (
  id TEXT PRIMARY KEY,
  entry_date TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  alt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_date) REFERENCES diary_entries(entry_date) ON DELETE CASCADE
);

CREATE INDEX diary_entries_status_date_idx
  ON diary_entries (status, entry_date);

CREATE INDEX diary_photos_entry_date_idx
  ON diary_photos (entry_date);
