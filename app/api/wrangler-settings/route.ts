import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



// ── GET /api/wrangler-settings ────────────────────────────────────────────────
// Returns all wrangler settings as a flat JSON object: { key: value, ... }
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rows = await sql`SELECT key, value FROM wrangler_settings`
  const result: Record<string, unknown> = {}
  for (const r of rows as Record<string, unknown>[]) {
    result[r.key as string] = r.value
  }
  return NextResponse.json(result)
}

// ── PATCH /api/wrangler-settings ──────────────────────────────────────────────
// Body: { [key: string]: any }  — upserts each key/value pair.
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as Record<string, unknown>

  for (const [key, value] of Object.entries(body)) {
    const jsonVal = JSON.stringify(value)
    await sql`
      INSERT INTO wrangler_settings (key, value, updated_at)
      VALUES (${key}, ${jsonVal}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = ${jsonVal}::jsonb, updated_at = NOW()
    `
  }

  return NextResponse.json({ ok: true, saved: Object.keys(body).length })
}
