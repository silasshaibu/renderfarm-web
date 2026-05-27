import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, ticketReplyToUserEmail, ticketReplyToAdminEmail } from '@/lib/email'

type Ctx = { params: Promise<{ id: string }> }
function ticketNum(id: number) { return `RF-SUPPORT-${String(id).padStart(4, '0')}` }

// POST /api/support/tickets/[id]/replies
export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  await initDB()

  // Load ticket to check permissions + get email
  const tickets = await sql`SELECT * FROM support_tickets WHERE id = ${id}` as Record<string, unknown>[]
  if (!tickets.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  const ticket = tickets[0]

  // Non-admins can only reply to their own tickets
  if (!user.isAdmin && Number(ticket.user_id) !== parseInt(user.sub, 10) && ticket.email !== user.email) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { message?: string; isInternal?: boolean }
  if (!body.message?.trim()) return NextResponse.json({ message: 'Message is required' }, { status: 400 })

  const isSupport  = Boolean(user.isAdmin)
  const isInternal = Boolean(body.isInternal) && isSupport

  const rows = await sql`
    INSERT INTO ticket_replies (ticket_id, user_id, is_support, is_internal, message)
    VALUES (${id}, ${parseInt(user.sub, 10)}, ${isSupport}, ${isInternal}, ${body.message.trim()})
    RETURNING id, created_at
  ` as Record<string, unknown>[]

  // Update ticket's updated_at + set to in_progress if still open
  await sql`
    UPDATE support_tickets
    SET updated_at = NOW(),
        status = CASE WHEN status = 'open' AND ${isSupport} THEN 'in_progress' ELSE status END
    WHERE id = ${id}
  `

  const ticketNum_ = ticketNum(Number(ticket.id))
  const subject    = ticket.subject as string

  if (!isInternal) {
    if (isSupport) {
      // Support replied → email user
      sendEmail({
        to:      ticket.email as string,
        subject: `Reply on ${ticketNum_}: ${subject}`,
        html:    ticketReplyToUserEmail({
          email: ticket.email as string, ticketNumber: ticketNum_, subject, replyText: body.message.trim(),
        }),
      })
    } else {
      // User replied → email admin
      const adminEmail = process.env.SUPPORT_EMAIL ?? ''
      if (adminEmail && adminEmail !== user.email) {
        sendEmail({
          to:      adminEmail,
          subject: `User replied on ${ticketNum_}: ${subject}`,
          html:    ticketReplyToAdminEmail({
            adminEmail, ticketNumber: ticketNum_, subject,
            replyText: body.message.trim(), userEmail: user.email,
          }),
        })
      }
    }
  }

  return NextResponse.json({
    id:        Number(rows[0].id),
    isSupport, isInternal,
    message:   body.message.trim(),
    userEmail: user.email,
    createdAt: rows[0].created_at,
  }, { status: 201 })
}
