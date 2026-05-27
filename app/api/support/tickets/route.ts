import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import {
  sendEmail, ticketConfirmEmail, ticketNotifyAdminEmail,
} from '@/lib/email'

function ticketNum(id: number) {
  return `RF-SUPPORT-${String(id).padStart(4, '0')}`
}

function rowToTicket(r: Record<string, unknown>) {
  const id = Number(r.id)
  return {
    id,
    ticketNumber: ticketNum(id),
    email:       r.email       as string,
    subject:     r.subject     as string,
    category:    r.category    as string,
    priority:    r.priority    as string,
    description: r.description as string,
    status:      r.status      as string,
    jobId:       (r.job_id     as string) || '',
    userId:      r.user_id     != null ? Number(r.user_id) : null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
    resolvedAt:  r.resolved_at ?? null,
  }
}

// GET /api/support/tickets — authenticated user's own tickets
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const userId = parseInt(user.sub, 10)
  const rows = user.isAdmin
    ? await sql`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200` as Record<string, unknown>[]
    : await sql`SELECT * FROM support_tickets WHERE user_id = ${userId} OR email = ${user.email}
                ORDER BY created_at DESC LIMIT 200` as Record<string, unknown>[]

  return NextResponse.json(rows.map(rowToTicket))
}

// POST /api/support/tickets — submit a new ticket
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as {
    subject?:     string
    category?:    string
    priority?:    string
    description?: string
    jobId?:       string
  }

  if (!body.subject?.trim())     return NextResponse.json({ message: 'Subject is required' },     { status: 400 })
  if (!body.description?.trim()) return NextResponse.json({ message: 'Description is required' }, { status: 400 })

  const rows = await sql`
    INSERT INTO support_tickets (email, subject, category, priority, description, user_id, job_id, status, updated_at)
    VALUES (
      ${user.email},
      ${body.subject.trim()},
      ${body.category?.trim()    ?? 'other'},
      ${body.priority?.trim()    ?? 'medium'},
      ${body.description.trim()},
      ${parseInt(user.sub, 10)},
      ${body.jobId?.trim()       ?? ''},
      'open',
      NOW()
    )
    RETURNING id, created_at
  ` as Record<string, unknown>[]

  const id     = Number(rows[0].id)
  const num    = ticketNum(id)
  const prio   = body.priority?.trim() ?? 'medium'
  const subj   = body.subject.trim()
  const cat    = body.category?.trim() ?? 'other'
  const desc   = body.description.trim()
  const jobId  = body.jobId?.trim() ?? ''

  // Confirmation email to user (fire-and-forget)
  sendEmail({
    to:      user.email,
    subject: `${num} Received — ${subj}`,
    html:    ticketConfirmEmail({ email: user.email, ticketNumber: num, subject: subj, priority: prio }),
  })

  // Notify admin
  const adminEmail = process.env.SUPPORT_EMAIL ?? process.env.RESEND_FROM ?? ''
  if (adminEmail && adminEmail !== user.email) {
    sendEmail({
      to:      adminEmail,
      subject: `[${prio.toUpperCase()}] New Ticket ${num}: ${subj}`,
      html:    ticketNotifyAdminEmail({
        adminEmail, ticketNumber: num, subject: subj, priority: prio,
        category: cat, description: desc, userEmail: user.email, jobId: jobId || undefined,
      }),
    })
  }

  return NextResponse.json({
    id,
    ticketNumber: num,
    createdAt: rows[0].created_at,
  }, { status: 201 })
}
