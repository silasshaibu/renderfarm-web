import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, logAudit } from '@/lib/credits'
import { sendEmail, baseUrl } from '@/lib/email'
import { getIP } from '@/lib/rateLimit'

// POST /api/admin/users/[id]/suspend — suspend or unsuspend a user
// Body: { action: 'suspend' | 'unsuspend', reason?: string }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  if (String(admin.sub) === id) {
    return NextResponse.json({ message: 'Cannot suspend your own account' }, { status: 400 })
  }

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const body = await req.json() as { action?: string; reason?: string }
  const action = body.action === 'unsuspend' ? 'unsuspend' : 'suspend'
  const reason = body.reason?.trim() ?? ''

  if (action === 'suspend' && !reason) {
    return NextResponse.json({ message: 'Suspension reason is required' }, { status: 400 })
  }

  if (action === 'suspend') {
    await sql`
      UPDATE users
      SET status = 'suspended', suspension_reason = ${reason},
          suspended_at = NOW(), suspended_by = ${admin.sub}
      WHERE id = ${id}
    `
    // Invalidate all active sessions for this user
    await sql`UPDATE user_sessions SET revoked = TRUE WHERE user_id = ${id}`
    // Blocklist all their tokens
    const activeSessions = await sql`SELECT jti FROM user_sessions WHERE user_id = ${id}` as Record<string, unknown>[]
    for (const s of activeSessions) {
      await sql`INSERT INTO token_blocklist (jti) VALUES (${s.jti}) ON CONFLICT (jti) DO NOTHING`
    }
  } else {
    await sql`
      UPDATE users
      SET status = 'active', suspension_reason = NULL, suspended_at = NULL, suspended_by = NULL
      WHERE id = ${id}
    `
  }

  await logAudit({
    adminId:      Number(admin.sub),
    targetUserId: Number(id),
    action:       action === 'suspend' ? 'suspend_account' : 'unsuspend_account',
    details:      { reason },
    ip:           getIP(req.headers),
  })

  // Email the user
  const userRows = await sql`SELECT email, name FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  const userEmail = userRows[0]?.email as string | undefined
  if (userEmail) {
    const subject = action === 'suspend'
      ? 'Your Renderfarm account has been suspended'
      : 'Your Renderfarm account has been reinstated'
    const body2 = action === 'suspend'
      ? `<p style="color:#94a3b8">Reason: ${reason}</p><p style="color:#94a3b8">If you believe this is an error, please contact support.</p>`
      : `<p style="color:#94a3b8">Your account access has been restored. You can log in and continue using Renderfarm.</p>`
    sendEmail({
      to: userEmail,
      subject,
      html: `<div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
        <h2 style="color:#fff">${subject}</h2>
        ${body2}
        <a href="${baseUrl()}/login" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Sign In</a>
      </div>`,
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, action })
}
