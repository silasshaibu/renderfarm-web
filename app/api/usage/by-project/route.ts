import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/usage/by-project?range=30&projectId=
// Returns spend + job count grouped by project name
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '30') || null

  const rows = rangeDays
    ? await sql`
        SELECT
          COALESCE(p.name, 'Default') AS name,
          COALESCE(SUM(j.cost_usd), 0) AS spend,
          COUNT(j.id) AS jobs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        WHERE j.status IN ('success', 'downloaded', 'done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        GROUP BY p.name
        ORDER BY spend DESC
        LIMIT 12
      ` as Record<string, unknown>[]
    : await sql`
        SELECT
          COALESCE(p.name, 'Default') AS name,
          COALESCE(SUM(j.cost_usd), 0) AS spend,
          COUNT(j.id) AS jobs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        WHERE j.status IN ('success', 'downloaded', 'done')
        GROUP BY p.name
        ORDER BY spend DESC
        LIMIT 12
      ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    name:  r.name  as string,
    spend: Number(r.spend ?? 0),
    jobs:  Number(r.jobs  ?? 0),
  })))
}
