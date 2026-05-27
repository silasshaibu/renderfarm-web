import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// PATCH /api/virtual-wrangler/syncer
// Body: { enabled: boolean, max_retries: number, timeout_minutes: number, action: "retry"|"fail"|"alert_retry" }
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as {
    enabled?: boolean; max_retries?: number; timeout_minutes?: number; action?: string
  }
  const value = JSON.stringify({
    enabled:         body.enabled         ?? false,
    max_retries:     body.max_retries     ?? 3,
    timeout_minutes: body.timeout_minutes ?? 60,
    action:          body.action          ?? 'retry',
  })

  await sql`
    INSERT INTO wrangler_settings (key, value, updated_at)
    VALUES ('syncer', ${value}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}::jsonb, updated_at = NOW()
  `

  return NextResponse.json({ ok: true })
}
