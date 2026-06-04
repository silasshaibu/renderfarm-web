import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensurePaymentSchema } from '@/lib/payments'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensurePaymentSchema()

  const rows = await sql`
    SELECT auto_topup_enabled, auto_topup_threshold, auto_topup_amount
    FROM users WHERE id = ${user.sub} LIMIT 1
  ` as Record<string, unknown>[]

  return NextResponse.json({
    enabled: Boolean(rows[0]?.auto_topup_enabled),
    threshold: Number(rows[0]?.auto_topup_threshold ?? 10),
    amount: Number(rows[0]?.auto_topup_amount ?? 100),
  })
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensurePaymentSchema()

  const body = await req.json() as {
    enabled?: boolean
    threshold?: number
    amount?: number
  }

  await sql`
    UPDATE users SET
      auto_topup_enabled    = COALESCE(${body.enabled ?? null}, auto_topup_enabled),
      auto_topup_threshold  = COALESCE(${body.threshold ?? null}, auto_topup_threshold),
      auto_topup_amount     = COALESCE(${body.amount ?? null}, auto_topup_amount)
    WHERE id = ${user.sub}
  `

  return NextResponse.json({ ok: true })
}
