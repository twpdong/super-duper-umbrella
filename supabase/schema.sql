-- ─────────────────────────────────────────────────────────────────────────────
-- Climate & Geo-Risk Monitor — Database schema (Supabase / Postgres)
-- ใช้ในเฟส 2: เก็บข้อมูล time-series + ผูกความเสี่ยงกับโปรเจกต์ของผู้ใช้
-- รันด้วย Supabase MCP (apply_migration) หรือ psql
-- ─────────────────────────────────────────────────────────────────────────────

-- ดัชนีอนุกรมเวลา (ONI, SST anomaly, heat index, water level ฯลฯ)
create table if not exists indicators (
  id          bigserial primary key,
  indicator   text not null,           -- เช่น 'oni', 'sst_anom', 'reservoir_pct'
  region      text,                    -- เช่น 'nino3.4', 'thailand', 'chao_phraya'
  value       double precision not null,
  unit        text,
  observed_at timestamptz not null,
  source      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_indicators_lookup on indicators (indicator, region, observed_at desc);

-- เหตุการณ์ (แผ่นดินไหว พายุ คลื่นความร้อน)
create table if not exists events (
  id          text primary key,        -- เช่น USGS id
  category    text not null,           -- 'earthquake' | 'cyclone' | 'heatwave' | 'flood' | 'drought'
  magnitude   double precision,
  place       text,
  lat         double precision,
  lon         double precision,
  occurred_at timestamptz not null,
  source      text not null,
  url         text,
  raw         jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_events_time on events (category, occurred_at desc);

-- พยากรณ์ที่ดึงจากสถาบัน
create table if not exists forecasts (
  id          bigserial primary key,
  topic       text not null,           -- 'enso' | 'typhoon_season' | 'seasonal_rain'
  horizon     text,                    -- เช่น 'SON 2026'
  summary     text,
  probability double precision,
  source      text not null,
  issued_at   timestamptz not null,
  raw         jsonb,
  created_at  timestamptz not null default now()
);

-- โปรเจกต์ของผู้ใช้ + พิกัด + ภาคส่วน (ใช้คิดความเสี่ยงเฉพาะตัว)
create table if not exists projects (
  id          bigserial primary key,
  name        text not null,
  sectors     text[] not null,         -- {'agri','finance','energy','health'}
  lat         double precision,
  lon         double precision,
  region      text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- คะแนนความเสี่ยงที่คำนวณรายโปรเจกต์/ช่วงเวลา
create table if not exists risk_scores (
  id          bigserial primary key,
  project_id  bigint references projects(id) on delete cascade,
  sector      text not null,
  period      text not null,           -- เช่น '2026-Q4'
  level       text not null,           -- 'low'|'moderate'|'high'|'severe'
  score       double precision,
  rationale   text,
  computed_at timestamptz not null default now()
);

-- log การแจ้งเตือน
create table if not exists alerts (
  id          bigserial primary key,
  level       text not null,
  title       text not null,
  body        text,
  channel     text,                    -- 'email'|'line'|'app'
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
