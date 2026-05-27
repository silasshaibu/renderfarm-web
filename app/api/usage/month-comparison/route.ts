import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/usage/month-comparison
// Returns monthly spend for the last 12 months — used for the MoM bar chart
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()

  const rows = await sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', j.created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
      COALESCE(SUM(j.cost_usd), 0) AS spend,
      COUNT(j.id)                   AS jobs
    FROM jobs j
    WHERE j.status IN ('success', 'downloaded', 'done')
      AND j.created_at >= NOW() - INTERVAL '12 months'
    GROUP BY month
    ORDER BY month ASC
  ` as Record<string, unknown>[]

  // Fill in months with no data so the chart always shows all 12 bars
  const result: { month: string; label: string; spend: number; jobs: number }[] = []
  const today = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const found = rows.find(r => (r.month as string) === key)
    result.push({
      month: key,
      label,
      spend: Number(found?.spend ?? 0),
      jobs:  Number(found?.jobs  ?? 0),
    })
  }

  return NextResponse.json(result)
}
