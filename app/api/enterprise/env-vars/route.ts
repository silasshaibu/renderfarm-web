import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS enterprise_env_vars (
      id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      key          TEXT NOT NULL,
      value        TEXT NOT NULL DEFAULT '',
      merge_policy TEXT NOT NULL DEFAULT 'append',
      sort_order   INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// GET /api/enterprise/env-vars
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()
  await ensureTable()
  const rows = await sql`SELECT * FROM enterprise_env_vars ORDER BY sort_order ASC, created_at ASC`
  return NextResponse.json((rows as Record<string, unknown>[]).map(r => ({
    id:          String(r.id),
    key:         r.key         as string,
    value:       r.value       as string,
    mergePolicy: r.merge_policy as string,
  })))
}

// POST /api/enterprise/env-vars  — replaces the full list (save-all pattern)
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  await initDB()
  await ensureTable()

  const body = await req.json() as { vars: { key: string; value: string; mergePolicy: string }[] }
  const vars  = Array.isArray(body.vars) ? body.vars : []

  // Validate: all keys must be non-empty
  for (const v of vars) {
    if (!v.key?.trim()) {
      return NextResponse.json({ message: 'Key cannot be empty' }, { status: 400 })
    }
  }

  // Replace entire list atomically
  await sql`DELETE FROM enterprise_env_vars`
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i]
    await sql`
      INSERT INTO enterprise_env_vars (key, value, merge_policy, sort_order)
      VALUES (${v.key.trim()}, ${v.value ?? ''}, ${v.mergePolicy ?? 'append'}, ${i})
    `
  }

  return NextResponse.json({ ok: true, count: vars.length })
}
