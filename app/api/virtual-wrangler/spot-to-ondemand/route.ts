import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// PATCH /api/virtual-wrangler/spot-to-ondemand
// Body: { enabled: boolean, wait_minutes: number, priority_threshold: number }
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { enabled?: boolean; wait_minutes?: number; priority_threshold?: number }
  const value = JSON.stringify({
    enabled:            body.enabled            ?? false,
    wait_minutes:       body.wait_minutes       ?? 30,
    priority_threshold: body.priority_threshold ?? 7,
  })

  await sql`
    INSERT INTO wrangler_settings (key, value, updated_at)
    VALUES ('spot_to_ondemand', ${value}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}::jsonb, updated_at = NOW()
  `

  return NextResponse.json({ ok: true })
}
