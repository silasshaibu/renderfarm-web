import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, logAudit } from '@/lib/credits'
import { getIP } from '@/lib/rateLimit'

// GET /api/admin/users/[id]/credit-limit — current limit for a user
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const rows = await sql`SELECT credit_limit FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  return NextResponse.json({ creditLimit: Number(rows[0].credit_limit ?? 0) })
}

// PATCH /api/admin/users/[id]/credit-limit — set outstanding balance limit
// Body: { creditLimit: number }  (0 = standard block-at-zero, >0 = allow overdraft up to this amount)
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()
  await ensureCreditSchema().catch(() => null)

  const body = await req.json() as { creditLimit?: number }
  const limit = Number(body.creditLimit ?? 0)
  if (isNaN(limit) || limit < 0) {
    return NextResponse.json({ message: 'creditLimit must be a non-negative number' }, { status: 400 })
  }

  const rows = await sql`SELECT id FROM users WHERE id = ${id} LIMIT 1` as Record<string, unknown>[]
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  await sql`UPDATE users SET credit_limit = ${limit} WHERE id = ${id}`

  await logAudit({
    adminId:      Number(admin.sub),
    targetUserId: Number(id),
    action:       'set_credit_limit',
    details:      { creditLimit: limit },
    ip:           getIP(req.headers),
  })

  return NextResponse.json({ ok: true, creditLimit: limit })
}
