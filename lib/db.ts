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

  // ── Projects ──────────────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      is_active  BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  // Seed a default project so the UI isn't empty on first run
  await sql`
    INSERT INTO projects (name, is_active)
    VALUES ('Default', TRUE)
    ON CONFLICT DO NOTHING
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
