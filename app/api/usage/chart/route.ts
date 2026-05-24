import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean } }
  catch { return null }
}

// ── GET /api/usage/chart ──────────────────────────────────────────────────────
// Returns daily-bucketed cost data for the chart.
// Shape: { date: 'YYYY-MM-DD', accountSpend: number, coreHours: number, storageSpend: number }[]
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '30') || 30

  const rows = await sql`
    SELECT
      DATE_TRUNC('day', j.created_at AT TIME ZONE 'UTC')::date AS day,
      COALESCE(SUM(j.cost_usd), 0)                             AS account_spend,
      COALESCE(SUM(
        (COALESCE((j.manifest->>'cores')::numeric, 4)) *
        COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) / 3600
      ), 0)                                                    AS core_hours
    FROM jobs j
    LEFT JOIN tasks t
      ON t.job_id = j.id
      AND t.completed_at IS NOT NULL
      AND t.started_at   IS NOT NULL
    WHERE j.status IN ('success', 'downloaded', 'done')
      AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
    GROUP BY day
    ORDER BY day ASC
  `

  // Fill in gaps — generate every day in the range, defaulting to 0
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const byDate = new Map<string, { accountSpend: number; coreHours: number }>()
  for (const r of rows as Record<string, unknown>[]) {
    const d = (r.day as string).slice(0, 10)
    byDate.set(d, {
      accountSpend: Number(r.account_spend ?? 0),
      coreHours:    Number(r.core_hours    ?? 0),
    })
  }

  const result: { date: string; accountSpend: number; coreHours: number; storageSpend: number }[] = []
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    const v   = byDate.get(key) ?? { accountSpend: 0, coreHours: 0 }
    result.push({ date: key, accountSpend: v.accountSpend, coreHours: v.coreHours, storageSpend: 0 })
  }

  return NextResponse.json(result)
}
