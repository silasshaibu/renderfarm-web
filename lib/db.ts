import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

export const sql = neon(process.env.DATABASE_URL)

let initialised = false

export async function initDB() {
  if (initialised) return
  initialised = true

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin    BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id           SERIAL PRIMARY KEY,
      job_number   TEXT UNIQUE NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT DEFAULT 'queued',
      frames       TEXT DEFAULT '1-1',
      software     TEXT DEFAULT 'blender-4-1',
      blender_file TEXT DEFAULT '',
      outputs      JSONB DEFAULT '[]',
      created_at   TIMESTAMP DEFAULT NOW(),
      updated_at   TIMESTAMP DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      sha256      TEXT PRIMARY KEY,
      blob_url    TEXT NOT NULL,
      filename    TEXT,
      size_bytes  BIGINT DEFAULT 0,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `

  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS manifest JSONB DEFAULT '{}'`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assets_total INT DEFAULT 0`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assets_uploaded INT DEFAULT 0`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS output_path TEXT DEFAULT ''`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS worker_host TEXT DEFAULT ''`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_description TEXT DEFAULT ''`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(10,4) DEFAULT 0`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'renderfarm'`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gcs_scene_path TEXT DEFAULT ''`
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS held_frames JSONB DEFAULT '[]'`

  // ── Wrangler settings — per-account key/value store ──────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS wrangler_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL DEFAULT 'null',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Projects ──────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      is_active  BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  // project_id FK on jobs — added after projects table exists
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL`

  // ── One-time dedup: delete extra rows where multiple rows share the same name,
  // keeping only the oldest (lowest id).  Safe because project_id on jobs was
  // NULL before this column was introduced, so no referential integrity to break.
  await sql`
    DELETE FROM projects
    WHERE id NOT IN (
      SELECT MIN(id) FROM projects GROUP BY name
    )
  `

  // ── Tasks — one row per frame; records per-frame timing from the worker ───────
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id           SERIAL PRIMARY KEY,
      job_id       INTEGER NOT NULL,
      frame_index  INTEGER NOT NULL,   -- 0-based index within the job
      frame_number INTEGER NOT NULL,   -- actual Blender frame number
      status       TEXT DEFAULT 'pending',
      started_at   TIMESTAMPTZ,        -- when worker picked up this frame
      completed_at TIMESTAMPTZ,        -- when upload finished
      output_url   TEXT DEFAULT '',
      worker_host  TEXT DEFAULT '',
      UNIQUE(job_id, frame_index)
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks(job_id)
  `

  // ── Task logs — written by the render worker during/after each frame ─────────
  await sql`
    CREATE TABLE IF NOT EXISTS task_logs (
      id           SERIAL PRIMARY KEY,
      job_id       INTEGER NOT NULL,
      frame_number INTEGER NOT NULL,
      log_line     TEXT NOT NULL,
      level        TEXT DEFAULT 'info',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_task_logs_job_frame
      ON task_logs(job_id, frame_number)
  `

  // ── Session tracking + JWT revocation ────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id    INTEGER NOT NULL,
      jti        TEXT UNIQUE NOT NULL,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked    BOOLEAN DEFAULT FALSE
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_jti  ON user_sessions(jti)`

  await sql`
    CREATE TABLE IF NOT EXISTS token_blocklist (
      jti        TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Cost limits ───────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS cost_limits (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      entity     TEXT NOT NULL,
      limit_type TEXT NOT NULL DEFAULT 'Job',
      limit_usd  NUMERIC(10,4) NOT NULL DEFAULT 0,
      units      TEXT NOT NULL DEFAULT 'Dollars',
      action     TEXT NOT NULL DEFAULT 'Send Email',
      start_date TEXT DEFAULT '',
      end_date   TEXT DEFAULT '',
      recurring  BOOLEAN DEFAULT FALSE,
      spent      NUMERIC(10,4) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Support tickets ───────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      subject     TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'general',
      priority    TEXT NOT NULL DEFAULT 'normal',
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // ── Rate-limit log — sliding-window counter per IP + action ─────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limit_log (
      id         BIGSERIAL PRIMARY KEY,
      key        TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_rl_key_ts ON rate_limit_log(key, created_at)`

  // ── Wrangler events — written by the render worker when it acts on jobs ──────
  await sql`
    CREATE TABLE IF NOT EXISTS wrangler_events (
      id          SERIAL PRIMARY KEY,
      wrangler    TEXT NOT NULL,      -- e.g. 'Max Frame/Task Runtime'
      job_number  TEXT NOT NULL,
      action      TEXT NOT NULL,      -- e.g. 'Task killed'
      detail      TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_wrangler_events_ts ON wrangler_events(created_at DESC)`

  // ── Machine types — admin-controlled list shown in the Blender addon dropdown ─
  await sql`
    CREATE TABLE IF NOT EXISTS machine_types (
      id          TEXT PRIMARY KEY,          -- addon identifier e.g. 'a100-80gb-1'
      label       TEXT NOT NULL,             -- display name e.g. 'A100 80GB · 12 vCPU · 85 GB'
      instance    TEXT NOT NULL DEFAULT 'GPU', -- 'GPU' | 'CPU'
      gcp_type    TEXT NOT NULL,             -- real GCP machine type string
      gpu_memory  TEXT NOT NULL DEFAULT '',  -- e.g. '80GB' — shown in UI
      vcpu        INTEGER NOT NULL DEFAULT 4,
      ram_gb      INTEGER NOT NULL DEFAULT 15,
      enabled     BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order  INTEGER NOT NULL DEFAULT 99,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `
  // Seed the canonical GPU list — insert only if not already present
  const mtSeed = [
    { id: 'a100-80gb-1', label: 'A100 80GB · 12 vCPU · 85 GB',  instance: 'GPU', gcp_type: 'a2-ultragpu-1g',  gpu_memory: '80GB', vcpu: 12, ram_gb: 85,  sort_order: 1 },
    { id: 'a100-40gb-1', label: 'A100 40GB · 12 vCPU · 85 GB',  instance: 'GPU', gcp_type: 'a2-highgpu-1g',   gpu_memory: '40GB', vcpu: 12, ram_gb: 85,  sort_order: 2 },
    { id: 'l4-1',        label: 'L4 24GB · 8 vCPU · 32 GB',     instance: 'GPU', gcp_type: 'g2-standard-8',   gpu_memory: '24GB', vcpu:  8, ram_gb: 32,  sort_order: 3 },
    { id: 't4-1',        label: 'T4 16GB · 4 vCPU · 15 GB',     instance: 'GPU', gcp_type: 'n1-standard-4',   gpu_memory: '16GB', vcpu:  4, ram_gb: 15,  sort_order: 4 },
    { id: 'v100-1',      label: 'V100 16GB · 8 vCPU · 52 GB',   instance: 'GPU', gcp_type: 'n1-standard-8',   gpu_memory: '16GB', vcpu:  8, ram_gb: 52,  sort_order: 5 },
    { id: 'n1-4',        label: 'CPU · 4 vCPU · 15 GB',         instance: 'CPU', gcp_type: 'n1-standard-4',   gpu_memory: '',     vcpu:  4, ram_gb: 15,  sort_order: 10 },
    { id: 'n1-8',        label: 'CPU · 8 vCPU · 30 GB',         instance: 'CPU', gcp_type: 'n1-standard-8',   gpu_memory: '',     vcpu:  8, ram_gb: 30,  sort_order: 11 },
    { id: 'n1-16',       label: 'CPU · 16 vCPU · 60 GB',        instance: 'CPU', gcp_type: 'n1-standard-16',  gpu_memory: '',     vcpu: 16, ram_gb: 60,  sort_order: 12 },
  ]
  for (const mt of mtSeed) {
    await sql`
      INSERT INTO machine_types (id, label, instance, gcp_type, gpu_memory, vcpu, ram_gb, enabled, sort_order)
      VALUES (${mt.id}, ${mt.label}, ${mt.instance}, ${mt.gcp_type}, ${mt.gpu_memory}, ${mt.vcpu}, ${mt.ram_gb}, FALSE, ${mt.sort_order})
      ON CONFLICT (id) DO NOTHING
    `
  }

  // Seed the default admin user if no users exist yet
  const existing = await sql`SELECT id FROM users LIMIT 1`
  if (existing.length === 0) {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('password123', 10)
    await sql`
      INSERT INTO users (email, password_hash, is_admin)
      VALUES ('silasshaibu2@gmail.com', ${hash}, TRUE)
      ON CONFLICT DO NOTHING
    `
  }
}
