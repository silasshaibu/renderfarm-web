import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, addCredit, getBalance, logAudit } from '@/lib/credits'
import { sendEmail, baseUrl } from '@/lib/email'
import { getIP } from '@/lib/rateLimit'

// GET /api/admin/users/[id]/credits — credit history for a user
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const page     = Math.max(1, Number(req.nextUrl.searchParams.get('page')     ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? '25')))
  const offset   = (page - 1) * pageSize

  const [balance, rows, countRows] = await Promise.all([
    getBalance(id),
    sql`
      SELECT id, amount, type, description, job_id, created_at, created_by
      FROM credits WHERE user_id = ${id}
      ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}
    ` as Promise<Record<string, unknown>[]>,
    sql`SELECT COUNT(*) AS cnt FROM credits WHERE user_id = ${id}` as Promise<Record<string, unknown>[]>,
  ])

  const total = Number(countRows[0]?.cnt ?? 0)
  let running = balance
  const items = rows.map(r => {
    const amt = Number(r.amount)
    const before = running
    running = running - amt
    return { id: r.id, amount: amt, type: r.type, description: r.description, jobId: r.job_id ?? null, createdAt: r.created_at, balance: before }
  })

  return NextResponse.json({ balance, items, total, page, pageSize, pages: Math.ceil(total / pageSize) })
}

// POST /api/admin/users/[id]/credits — grant or deduct credits
// Body: { amount: number, description: string, type?: 'admin_grant' | 'refund' | 'usage' }
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const body = await req.json() as { amount?: number; description?: string; type?: string }
  const amount = Number(body.amount ?? 0)
  if (!amount || !body.description?.trim()) {
    return NextResponse.json({ message: 'amount and description are required' }, { status: 400 })
  }

  const type = (body.type === 'refund' ? 'refund' : amount > 0 ? 'admin_grant' : 'usage') as 'admin_grant' | 'refund' | 'usage'

  await addCredit({
    userId:      Number(id),
    amount,
    type,
    description: body.description.trim(),
    createdBy:   Number(admin.sub),
  })

  const newBalance = await getBalance(id)

  // Audit log
  await logAudit({
    adminId:       Number(admin.sub),
    targetUserId:  Number(id),
    action:        amount > 0 ? 'grant_credits' : 'deduct_credits',
    details:       { amount, description: body.description.trim(), newBalance },
    ip:            getIP(req.headers),
  })

  // Email the user
  const userRows = await sql`SELECT email FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  const userEmail = userRows[0]?.email as string | undefined
  if (userEmail) {
    const subject = amount > 0
      ? `Renderfarm: $${amount.toFixed(2)} credits added to your account`
      : `Renderfarm: $${Math.abs(amount).toFixed(2)} credits deducted from your account`
    sendEmail({
      to: userEmail,
      subject,
      html: `<div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
        <h2 style="color:#fff">${subject}</h2>
        <p style="color:#94a3b8">Reason: ${body.description}</p>
        <p style="color:#94a3b8">New balance: <strong style="color:#fff">$${newBalance.toFixed(2)}</strong></p>
        <a href="${baseUrl()}/profile" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">View Account</a>
      </div>`,
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, newBalance })
}
