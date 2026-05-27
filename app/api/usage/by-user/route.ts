import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/usage/by-user?range=30 — admin only
// Returns spend + job count grouped by user
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '30') || null

  const rows = rangeDays
    ? await sql`
        WITH job_hours AS (
          SELECT
            j.id,
            j.user_id,
            j.cost_usd,
            COALESCE((j.manifest->>'cores')::numeric, 4) *
            COALESCE((
              SELECT SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)))
              FROM tasks t
              WHERE t.job_id = j.id
                AND t.completed_at IS NOT NULL
                AND t.started_at   IS NOT NULL
            ), 0) / 3600 AS core_hours
          FROM jobs j
          WHERE j.status IN ('success', 'downloaded', 'done')
            AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        )
        SELECT
          COALESCE(u.email, 'Unknown') AS email,
          COUNT(jh.id)                 AS jobs,
          COALESCE(SUM(jh.cost_usd), 0)  AS spend,
          COALESCE(SUM(jh.core_hours), 0) AS core_hours
        FROM job_hours jh
        LEFT JOIN users u ON u.id = jh.user_id
        GROUP BY u.id, u.email
        ORDER BY spend DESC
        LIMIT 50
      ` as Record<string, unknown>[]
    : await sql`
        WITH job_hours AS (
          SELECT
            j.id,
            j.user_id,
            j.cost_usd,
            COALESCE((j.manifest->>'cores')::numeric, 4) *
            COALESCE((
              SELECT SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)))
              FROM tasks t
              WHERE t.job_id = j.id
                AND t.completed_at IS NOT NULL
                AND t.started_at   IS NOT NULL
            ), 0) / 3600 AS core_hours
          FROM jobs j
          WHERE j.status IN ('success', 'downloaded', 'done')
        )
        SELECT
          COALESCE(u.email, 'Unknown') AS email,
          COUNT(jh.id)                  AS jobs,
          COALESCE(SUM(jh.cost_usd), 0)   AS spend,
          COALESCE(SUM(jh.core_hours), 0)  AS core_hours
        FROM job_hours jh
        LEFT JOIN users u ON u.id = jh.user_id
        GROUP BY u.id, u.email
        ORDER BY spend DESC
        LIMIT 50
      ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    email:     r.email     as string,
    jobs:      Number(r.jobs      ?? 0),
    spend:     Number(r.spend     ?? 0),
    coreHours: Number(r.core_hours ?? 0),
  })))
}
