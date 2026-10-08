CREATE TABLE IF NOT EXISTS data_requests (
  serial INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('all','tube','sheet','profile')),
  scope_location TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  requester TEXT NOT NULL,
  supplier TEXT NOT NULL,
  required_as_of TEXT NOT NULL,
  due_at TEXT NOT NULL,
  freshness_hours INTEGER NOT NULL CHECK(freshness_hours BETWEEN 1 AND 720),
  status TEXT NOT NULL CHECK(status IN ('waiting','partial','received','verified','unavailable','cancelled')),
  requested_at TEXT NOT NULL,
  notified_at TEXT,
  received_at TEXT,
  as_of_at TEXT,
  verified_at TEXT,
  respondent TEXT NOT NULL DEFAULT '',
  verifier TEXT NOT NULL DEFAULT '',
  evidence_ref TEXT NOT NULL DEFAULT '',
  snapshot TEXT,
  last_event_id TEXT NOT NULL REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS data_requests_scope ON data_requests(scope_type,scope_location,serial DESC);
PRAGMA user_version=2;
