import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, ticketResolvedEmail } from '@/lib/email'

type Ctx = { params: Promise<{ id: string }> }

function ticketNum(id: number) { return `RF-SUPPORT-${String(id).padStart(4, '0')}` }

// GET /api/support/tickets/[id]
export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  await initDB()

  const rows = await sql`
    SELECT * FROM support_tickets WHERE id = ${id}
  ` as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  const t = rows[0]

  // Non-admins can only see their own tickets
  if (!user.isAdmin && Number(t.user_id) !== parseInt(user.sub, 10) && t.email !== user.email) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  // Load replies
  const replies = await sql`
    SELECT r.*, u.email AS user_email
    FROM ticket_replies r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.ticket_id = ${id}
    ORDER BY r.created_at ASC
  ` as Record<string, unknown>[]

  const tid = Number(t.id)
  return NextResponse.json({
    id:          tid,
    ticketNumber: ticketNum(tid),
    email:       t.email,
    subject:     t.subject,
    category:    t.category,
    priority:    t.priority,
    description: t.description,
    status:      t.status,
    jobId:       (t.job_id as string) || '',
    createdAt:   t.created_at,
    updatedAt:   t.updated_at,
    resolvedAt:  t.resolved_at ?? null,
    replies: replies.map(r => ({
      id:         Number(r.id),
      isSupport:  Boolean(r.is_support),
      isInternal: Boolean(r.is_internal),
      message:    r.message as string,
      userEmail:  (r.user_email as string) || (Boolean(r.is_support) ? 'Support Team' : t.email as string),
      createdAt:  r.created_at,
    })),
  })
}

// PATCH /api/support/tickets/[id] — update status (admin only)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  await initDB()

  const body = await req.json() as { status?: string }

  const rows = await sql`
    UPDATE support_tickets
    SET
      status     = COALESCE(${body.status ?? null}, status),
      updated_at = NOW(),
      resolved_at = CASE
        WHEN ${body.status ?? null} IN ('resolved', 'closed') AND resolved_at IS NULL THEN NOW()
        ELSE resolved_at
      END
    WHERE id = ${id}
    RETURNING id, email, subject, status
  ` as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const t = rows[0]
  const tid = Number(t.id)

  // Email user when resolved
  if (body.status === 'resolved') {
    sendEmail({
      to:      t.email as string,
      subject: `${ticketNum(tid)} Resolved`,
      html:    ticketResolvedEmail({
        email: t.email as string,
        ticketNumber: ticketNum(tid),
        subject: t.subject as string,
      }),
    })
  }

  return NextResponse.json({ ok: true, status: rows[0].status })
}
