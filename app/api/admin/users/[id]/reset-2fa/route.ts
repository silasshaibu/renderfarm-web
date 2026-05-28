import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { logAudit } from '@/lib/credits'
import { getIP } from '@/lib/rateLimit'

// POST /api/admin/users/[id]/reset-2fa — clears TOTP for a user (admin only)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()

  const rows = await sql`SELECT id FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  await sql`
    UPDATE users
    SET totp_secret = NULL, totp_enabled = FALSE, totp_backup_codes = NULL
    WHERE id = ${id}
  `

  await logAudit({
    adminId:      Number(admin.sub),
    targetUserId: Number(id),
    action:       'reset_2fa',
    details:      {},
    ip:           getIP(req.headers),
  })

  return NextResponse.json({ ok: true })
}
