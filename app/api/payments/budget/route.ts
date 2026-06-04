import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const startDate = start.toISOString().slice(0, 10)
  const endDate   = end.toISOString().slice(0, 10)

  // Amount spent on render jobs this period
  const jobRows = await sql`
    SELECT COALESCE(SUM(cost_usd), 0) AS total
    FROM jobs
    WHERE user_id = ${user.sub}
      AND status IN ('success', 'downloaded', 'done')
      AND updated_at >= ${start.toISOString()}
      AND updated_at <= ${end.toISOString()}
  ` as Record<string, unknown>[]
  const amountSpent = Number(jobRows[0]?.total ?? 0)

  // Credits purchased this period (prepay + admin grants)
  const creditRows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM credits
    WHERE user_id = ${user.sub}
      AND type IN ('purchased', 'admin_grant', 'welcome_bonus')
      AND created_at >= ${start.toISOString()}
      AND created_at <= ${end.toISOString()}
  ` as Record<string, unknown>[]
  const additionalCredits = Number(creditRows[0]?.total ?? 0)

  // Amount charged to card this period (settled transactions)
  const txRows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE user_id = ${user.sub}
      AND status = 'settled'
      AND created_at >= ${start.toISOString()}
      AND created_at <= ${end.toISOString()}
  ` as Record<string, unknown>[]
  const amountCharged = Number(txRows[0]?.total ?? 0)

  // Overall balance (positive = credit remaining, negative = owes money)
  const balanceRows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS balance FROM credits WHERE user_id = ${user.sub}
  ` as Record<string, unknown>[]
  const balance = Number(balanceRows[0]?.balance ?? 0)
  const outstandingBalance = balance < 0 ? Math.abs(balance) : 0

  return NextResponse.json({
    startDate,
    endDate,
    carryOver: 0,
    amountSpent: Math.round(amountSpent * 100) / 100,
    amountCharged: Math.round(amountCharged * 100) / 100,
    additionalCredits: Math.round(additionalCredits * 100) / 100,
    outstandingBalance: Math.round(outstandingBalance * 100) / 100,
  })
}
