import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, supportConfirmEmail } from '@/lib/email'

// ── POST /api/support ─────────────────────────────────────────────────────────
// Submit a support ticket. Auth optional — logged-in users pre-fill email.
export async function POST(req: NextRequest) {
  await initDB()

  const body = await req.json() as {
    email?:       string
    subject?:     string
    category?:    string
    priority?:    string
    description?: string
  }

  if (!body.email?.trim()) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 })
  }
  if (!body.description?.trim()) {
    return NextResponse.json({ message: 'Description is required' }, { status: 400 })
  }

  const rows = await sql`
    INSERT INTO support_tickets (email, subject, category, priority, description)
    VALUES (
      ${body.email.trim()},
      ${body.subject?.trim()   ?? ''},
      ${body.category?.trim()  ?? 'general'},
      ${body.priority?.trim()  ?? 'normal'},
      ${body.description.trim()}
    )
    RETURNING id, created_at
  ` as Record<string, unknown>[]

  const ticketId = rows[0].id as number

  // Send confirmation email (best-effort — don't fail the request if email is misconfigured)
  await sendEmail({
    to:      body.email!.trim(),
    subject: `Support request received — ticket #${ticketId}`,
    html:    supportConfirmEmail({
      email:    body.email!.trim(),
      subject:  body.subject?.trim() ?? 'Support request',
      ticketId,
    }),
  })

  return NextResponse.json({
    id:        ticketId,
    createdAt: rows[0].created_at,
    message:   'Ticket submitted successfully',
  }, { status: 201 })
}

// ── GET /api/support ──────────────────────────────────────────────────────────
// Admin: list all support tickets.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const rows = await sql`
    SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:          r.id,
    email:       r.email,
    subject:     r.subject,
    category:    r.category,
    priority:    r.priority,
    description: r.description,
    status:      r.status,
    createdAt:   r.created_at,
  })))
}
