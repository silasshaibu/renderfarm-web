import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema, getBalance } from '@/lib/credits'

// GET /api/profile/credits?page=1&pageSize=25
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const page     = Math.max(1, Number(req.nextUrl.searchParams.get('page')     ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? '25')))
  const offset   = (page - 1) * pageSize

  const [balance, rows, countRows] = await Promise.all([
    getBalance(user.sub),
    sql`
      SELECT id, amount, type, description, job_id, created_at, created_by
      FROM credits
      WHERE user_id = ${user.sub}
      ORDER BY created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    ` as Promise<Record<string, unknown>[]>,
    sql`SELECT COUNT(*) AS cnt FROM credits WHERE user_id = ${user.sub}` as Promise<Record<string, unknown>[]>,
  ])

  const total = Number(countRows[0]?.cnt ?? 0)

  // Compute running balance (descending — subtract from current balance going back)
  let running = balance
  const items = rows.map(r => {
    const amt    = Number(r.amount)
    const before = running
    running      = running - amt   // going backward in time
    return {
      id:          r.id,
      amount:      amt,
      type:        r.type,
      description: r.description,
      jobId:       r.job_id ?? null,
      createdAt:   r.created_at,
      balance:     before,
    }
  })

  return NextResponse.json({
    balance,
    items,
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  })
}
