import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, addCredit, logAudit, grantWelcomeBonus } from '@/lib/credits'
import { getIP } from '@/lib/rateLimit'

// GET /api/admin/users/[id]/abuse-signals — list abuse signals for a user
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const rows = await sql`
    SELECT a.*, u.email AS matched_email
    FROM abuse_signals a
    LEFT JOIN users u ON u.id = a.matched_user_id
    WHERE a.user_id = ${id}
    ORDER BY a.created_at DESC
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:            r.id,
    signalType:    r.signal_type,
    matchedUserId: r.matched_user_id,
    matchedEmail:  r.matched_email ?? null,
    details:       r.details,
    reviewed:      r.reviewed,
    actionTaken:   r.action_taken,
    createdAt:     r.created_at,
  })))
}

// POST /api/admin/users/[id]/abuse-signals — take action on a signal
// Body: { signalId: number, action: 'allow' | 'block' | 'ignore' }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const body = await req.json() as { signalId?: number; action?: string }
  if (!body.signalId || !body.action) {
    return NextResponse.json({ message: 'signalId and action are required' }, { status: 400 })
  }

  const action = body.action as 'allow' | 'block' | 'ignore'
  await sql`
    UPDATE abuse_signals SET reviewed = TRUE, action_taken = ${action} WHERE id = ${body.signalId} AND user_id = ${id}
  `

  const userRows = await sql`SELECT email, name FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  const userEmail = userRows[0]?.email as string | undefined
  const firstName = ((userRows[0]?.name as string) ?? '').split(' ')[0] || 'User'

  if (action === 'allow') {
    // Grant the welcome bonus if not already granted
    if (userEmail) await grantWelcomeBonus(Number(id), userEmail, firstName)
    await logAudit({ adminId: Number(admin.sub), targetUserId: Number(id), action: 'allow_abuse_signal', details: { signalId: body.signalId }, ip: getIP(req.headers) })
  } else if (action === 'block') {
    // Suspend account + deduct welcome bonus
    await sql`UPDATE users SET status = 'suspended', suspension_reason = 'Multiple account creation detected' WHERE id = ${id}`
    await sql`UPDATE user_sessions SET revoked = TRUE WHERE user_id = ${id}`
    // Deduct any previously granted welcome bonus
    const existing = await sql`SELECT id FROM credits WHERE user_id = ${id} AND type = 'welcome_bonus' LIMIT 1` as Record<string, unknown>[]
    if (existing.length > 0) {
      await addCredit({ userId: Number(id), amount: -50, type: 'usage', description: 'Welcome bonus revoked — abuse detected', createdBy: Number(admin.sub) })
    }
    await logAudit({ adminId: Number(admin.sub), targetUserId: Number(id), action: 'block_abuse_signal', details: { signalId: body.signalId }, ip: getIP(req.headers) })
  } else {
    await logAudit({ adminId: Number(admin.sub), targetUserId: Number(id), action: 'ignore_abuse_signal', details: { signalId: body.signalId }, ip: getIP(req.headers) })
  }

  return NextResponse.json({ ok: true })
}
