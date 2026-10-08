CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK(id=1),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO meta(id,revision) VALUES(1,0);
CREATE TABLE IF NOT EXISTS material_groups (
  id TEXT PRIMARY KEY,
  group_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('tube','sheet','profile')),
  material TEXT NOT NULL,
  diameter_um INTEGER,
  thickness_um INTEGER NOT NULL CHECK(thickness_um>0),
  width_um INTEGER,
  height_um INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  piece_id TEXT,
  document TEXT NOT NULL,
  operation_date TEXT NOT NULL,
  operator TEXT NOT NULL,
  order_code TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL,
  actor TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pieces (
  serial INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  group_id TEXT NOT NULL REFERENCES material_groups(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  length_um INTEGER NOT NULL CHECK(length_um>0),
  width_um INTEGER,
  remnant INTEGER NOT NULL DEFAULT 0 CHECK(remnant IN (0,1)),
  status TEXT NOT NULL CHECK(status IN ('available','reserved','issued')),
  reservation_order TEXT NOT NULL DEFAULT '',
  receipt_event_id TEXT NOT NULL REFERENCES events(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_event_id TEXT NOT NULL REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS pieces_stock ON pieces(group_id,location_id,status,length_um DESC,width_um DESC);
CREATE INDEX IF NOT EXISTS events_time ON events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS events_piece ON events(piece_id);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  digest TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id),
  result TEXT NOT NULL
);
PRAGMA user_version=1;
