import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string } }
  catch { return null }
}

// ── GET /api/payments/period ──────────────────────────────────────────────────
// Returns the current billing period summary (same data as /api/payments/budget,
// kept as an alias for api.ts compatibility).
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const startDate = start.toISOString().slice(0, 10)
  const endDate   = end.toISOString().slice(0, 10)

  const rows = await sql`
    SELECT COALESCE(SUM(cost_usd), 0) AS total
    FROM   jobs
    WHERE  status IN ('success', 'downloaded', 'done')
      AND  updated_at >= ${start.toISOString()}
      AND  updated_at <= ${end.toISOString()}
  ` as Record<string, unknown>[]

  const amountSpent = parseFloat(String(rows[0]?.total ?? 0))

  return NextResponse.json({
    startDate,
    endDate,
    carryOver:          0,
    amountSpent,
    amountCharged:      amountSpent,
    outstandingBalance: 0,
  })
}
