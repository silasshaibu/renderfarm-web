import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema } from '@/lib/credits'

// GET /api/admin/credits-overview
export async function GET(req: NextRequest) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const [issued, consumed, balances, pendingAbuse, userCredits] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount),0) AS total FROM credits WHERE amount > 0` as Promise<Record<string, unknown>[]>,
    sql`SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM credits WHERE amount < 0` as Promise<Record<string, unknown>[]>,
    sql`SELECT COALESCE(SUM(amount),0) AS total FROM credits` as Promise<Record<string, unknown>[]>,
    sql`SELECT COUNT(*) AS cnt FROM abuse_signals WHERE reviewed = FALSE` as Promise<Record<string, unknown>[]>,
    // Per-user balances for the enhanced user table
    sql`SELECT user_id, SUM(amount) AS balance FROM credits GROUP BY user_id` as Promise<Record<string, unknown>[]>,
  ])

  const balanceMap: Record<string, number> = {}
  for (const r of userCredits) {
    balanceMap[String(r.user_id)] = Number(r.balance)
  }

  return NextResponse.json({
    totalIssued:      Number(issued[0]?.total   ?? 0),
    totalConsumed:    Number(consumed[0]?.total  ?? 0),
    outstanding:      Number(balances[0]?.total  ?? 0),
    pendingAbuse:     Number(pendingAbuse[0]?.cnt ?? 0),
    balanceMap,
  })
}
