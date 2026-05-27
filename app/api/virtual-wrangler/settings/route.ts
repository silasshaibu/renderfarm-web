import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// Default configs used when keys are missing from DB
const DEFAULTS = {
  max_runtime: { enabled: true,  max_hours: 1,   action: 'kill' },
  relocation:  { enabled: true,  max_wait_minutes: 90, priority_threshold: 5 },
  spot_to_ondemand: { enabled: false, wait_minutes: 30, priority_threshold: 7 },
  syncer:      { enabled: false, max_retries: 3,  timeout_minutes: 60, action: 'retry' },
}

// GET /api/virtual-wrangler/settings
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rows = await sql`
    SELECT key, value FROM wrangler_settings
    WHERE key IN ('max_runtime','relocation','spot_to_ondemand','syncer')
  ` as Record<string, unknown>[]

  const settings: Record<string, unknown> = { ...DEFAULTS }
  for (const r of rows) {
    settings[r.key as string] = r.value
  }

  return NextResponse.json(settings)
}

// PATCH /api/virtual-wrangler/settings  — bulk update all wranglers at once
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as Record<string, unknown>
  const allowed = ['max_runtime', 'relocation', 'spot_to_ondemand', 'syncer']

  for (const key of allowed) {
    if (body[key] !== undefined) {
      const v = JSON.stringify(body[key])
      await sql`
        INSERT INTO wrangler_settings (key, value, updated_at)
        VALUES (${key}, ${v}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${v}::jsonb, updated_at = NOW()
      `
    }
  }

  return NextResponse.json({ ok: true })
}
