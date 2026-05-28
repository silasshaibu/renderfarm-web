import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { verifyToken, JWT_SECRET, makeJti } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, logAudit } from '@/lib/credits'
import { getIP } from '@/lib/rateLimit'

// POST /api/admin/users/[id]/impersonate
// Creates an impersonation token for the target user.
// The token carries impersonated_by so the UI can show the banner.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  if (String(admin.sub) === id) {
    return NextResponse.json({ message: 'Cannot impersonate yourself' }, { status: 400 })
  }

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const userRows = await sql`SELECT id, email, is_admin FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  if (!userRows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  const target = userRows[0] as { id: number; email: string; is_admin: boolean }

  const jti       = makeJti()
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours max
  const token     = jwt.sign(
    {
      sub:              String(target.id),
      email:            target.email,
      isAdmin:          false,          // impersonator never gets admin rights of target
      jti,
      impersonated_by:  String(admin.sub),
      impersonator_email: admin.email,
    },
    JWT_SECRET,
    { expiresIn: '2h' },
  )

  const ip = getIP(req.headers)
  const ua = req.headers.get('user-agent') ?? ''
  await sql`
    INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at)
    VALUES (${target.id}, ${jti}, ${ip}, ${ua}, ${expiresAt.toISOString()})
    ON CONFLICT (jti) DO NOTHING
  `

  await logAudit({
    adminId:      Number(admin.sub),
    targetUserId: target.id,
    action:       'impersonate_start',
    details:      { targetEmail: target.email },
    ip,
  })

  return NextResponse.json({
    access_token:       token,
    user:               { id: String(target.id), email: target.email, isAdmin: false },
    impersonated_by:    String(admin.sub),
    impersonator_email: admin.email,
  })
}
