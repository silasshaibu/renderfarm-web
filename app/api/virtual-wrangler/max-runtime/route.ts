import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// PATCH /api/virtual-wrangler/max-runtime
// Body: { enabled: boolean, max_hours: number, action: "kill" | "retry" | "notify" }
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { enabled?: boolean; max_hours?: number; action?: string }
  const value = JSON.stringify({
    enabled:   body.enabled  ?? false,
    max_hours: body.max_hours ?? 1,
    action:    body.action   ?? 'kill',
  })

  await sql`
    INSERT INTO wrangler_settings (key, value, updated_at)
    VALUES ('max_runtime', ${value}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}::jsonb, updated_at = NOW()
  `

  return NextResponse.json({ ok: true })
}
