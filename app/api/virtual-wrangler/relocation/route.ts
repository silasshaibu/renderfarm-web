import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// PATCH /api/virtual-wrangler/relocation
// Body: { enabled: boolean, max_wait_minutes: number, priority_threshold: number }
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { enabled?: boolean; max_wait_minutes?: number; priority_threshold?: number }
  const value = JSON.stringify({
    enabled:            body.enabled            ?? false,
    max_wait_minutes:   body.max_wait_minutes   ?? 90,
    priority_threshold: body.priority_threshold ?? 5,
  })

  await sql`
    INSERT INTO wrangler_settings (key, value, updated_at)
    VALUES ('relocation', ${value}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}::jsonb, updated_at = NOW()
  `

  return NextResponse.json({ ok: true })
}
