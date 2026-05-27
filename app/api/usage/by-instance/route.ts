import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/usage/by-instance?range=30
// Returns spend grouped by machine/instance type from manifest
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '30') || null

  const rows = rangeDays
    ? await sql`
        SELECT
          COALESCE(mt.label, j.manifest->>'machine_type', 'CPU · Standard') AS type,
          COALESCE(SUM(j.cost_usd), 0) AS spend,
          COUNT(j.id) AS jobs
        FROM jobs j
        LEFT JOIN machine_types mt ON mt.id = j.manifest->>'machine_type'
        WHERE j.status IN ('success', 'downloaded', 'done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        GROUP BY mt.label, j.manifest->>'machine_type'
        ORDER BY spend DESC
        LIMIT 10
      ` as Record<string, unknown>[]
    : await sql`
        SELECT
          COALESCE(mt.label, j.manifest->>'machine_type', 'CPU · Standard') AS type,
          COALESCE(SUM(j.cost_usd), 0) AS spend,
          COUNT(j.id) AS jobs
        FROM jobs j
        LEFT JOIN machine_types mt ON mt.id = j.manifest->>'machine_type'
        WHERE j.status IN ('success', 'downloaded', 'done')
        GROUP BY mt.label, j.manifest->>'machine_type'
        ORDER BY spend DESC
        LIMIT 10
      ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    type:  r.type  as string,
    spend: Number(r.spend ?? 0),
    jobs:  Number(r.jobs  ?? 0),
  })))
}
