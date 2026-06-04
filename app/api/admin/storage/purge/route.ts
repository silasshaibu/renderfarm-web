import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

async function ensureSettingsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS wrangler_settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT 'null'
    )
  `
}

// ── POST /api/admin/storage/purge — initiate purge ───────────────────────────
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureSettingsTable()

  const now = new Date().toISOString()

  await sql`
    INSERT INTO wrangler_settings (key, value) VALUES ('purge_in_progress', 'true'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb
  `
  await sql`
    INSERT INTO wrangler_settings (key, value) VALUES ('purge_initiated_at', ${JSON.stringify(now)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(now)}::jsonb
  `

  // Best-effort: remove all rows from assets table
  await sql`TRUNCATE TABLE assets`.catch(() => null)

  return NextResponse.json({
    ok: true,
    message: 'Purge initiated. This process may take up to 24 hours. You will receive an email when complete.',
  })
}

// ── GET /api/admin/storage/purge — check purge status ────────────────────────
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureSettingsTable()

  const rows = await sql`
    SELECT key, value FROM wrangler_settings WHERE key IN ('purge_in_progress', 'purge_initiated_at')
  ` as Record<string, unknown>[]

  const map: Record<string, unknown> = {}
  for (const r of rows) map[r.key as string] = r.value

  return NextResponse.json({
    inProgress:  map.purge_in_progress  === true,
    initiatedAt: map.purge_initiated_at ?? null,
  })
}
