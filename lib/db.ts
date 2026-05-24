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
