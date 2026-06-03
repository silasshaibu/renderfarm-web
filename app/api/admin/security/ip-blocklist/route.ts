import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const rows = await sql`
    SELECT id, ip_address, reason, blocked_at, blocked_by, expires_at,
           (expires_at IS NULL OR expires_at > NOW()) as is_active
    FROM ip_blocklist
    ORDER BY blocked_at DESC
    LIMIT 500
  ` as Record<string, unknown>[]

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const { ip, reason, expiresHours } = await req.json() as {
    ip: string
    reason: string
    expiresHours: number | null
  }

  if (!ip || !reason) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const expiresAt = expiresHours
    ? new Date(Date.now() + expiresHours * 3600 * 1000)
    : null

  try {
    await sql`
      INSERT INTO ip_blocklist (ip_address, reason, blocked_by, expires_at)
      VALUES (${ip}, ${reason}, ${user.email}, ${expiresAt})
      ON CONFLICT (ip_address) DO UPDATE
      SET reason = EXCLUDED.reason,
          blocked_at = NOW(),
          expires_at = EXCLUDED.expires_at
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ip-blocklist] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
