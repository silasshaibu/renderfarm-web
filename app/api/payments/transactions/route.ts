import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



// ── GET /api/payments/transactions ────────────────────────────────────────────
// Returns billing transactions derived from completed jobs.
// Each completed job becomes a transaction line in the billing history.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  // Build transactions from jobs that have a non-zero cost
  const rows = await sql`
    SELECT job_number, title, status, cost_usd, created_at, updated_at
    FROM   jobs
    WHERE  status IN ('success', 'downloaded', 'done')
      AND  cost_usd > 0
    ORDER  BY updated_at DESC
    LIMIT  100
  ` as Record<string, unknown>[]

  const transactions = rows.map((r, i) => ({
    id:          `txn-${r.job_number}`,
    date:        r.updated_at,
    description: `Job #${r.job_number} — ${r.title}`,
    type:        'render' as const,
    amount:      parseFloat(String(r.cost_usd ?? 0)),
    status:      'settled' as const,
  }))

  return NextResponse.json(transactions)
}
