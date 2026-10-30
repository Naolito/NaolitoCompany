CREATE TABLE agencies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL,
  score REAL NOT NULL,
  top_rank INTEGER,
  sort INTEGER NOT NULL,
  web TEXT,
  email TEXT,
  form TEXT,
  person TEXT,
  greeting TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  lang TEXT NOT NULL CHECK (lang IN ('es', 'en')),
  vias TEXT NOT NULL,
  research TEXT NOT NULL,
  via TEXT NOT NULL CHECK (via IN ('form', 'email', 'pending', 'third')),
  state TEXT NOT NULL DEFAULT 'nuevo' CHECK (state IN
    ('nuevo', 'cola', 'preparando', 'atencion', 'enviado', 'respondio', 'reunion', 'firmada', 'descartada')),
  why TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT
);

CREATE TABLE templates (
  lang TEXT PRIMARY KEY CHECK (lang IN ('es', 'en')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT,
  approved_by TEXT,
  approved_at TEXT
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id TEXT REFERENCES agencies (id),
  template_lang TEXT,
  actor TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('person', 'agent')),
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX events_agency ON events (agency_id, id);

CREATE TABLE sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id TEXT NOT NULL REFERENCES agencies (id),
  status TEXT NOT NULL CHECK (status IN ('enviado', 'atencion')),
  via TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  body TEXT,
  proof TEXT,
  template_version INTEGER,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sends_agency ON sends (agency_id, id);

CREATE TABLE report (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);
