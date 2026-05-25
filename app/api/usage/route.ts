import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



// ── Pricing constants (USD per hour) ─────────────────────────────────────────
const CPU_PER_CORE_HR = 0.03
const GPU_PER_GPU_HR  = 0.45

// ── GET /api/usage ────────────────────────────────────────────────────────────
// Returns:
//   { records: UsageRecord[], summary: { totalCost, totalCoreHours, totalJobs, avgCostPerJob } }
//
// Query params:
//   range=<days>        — only jobs created within the last N days (omit = all time)
//   projectId=<id>      — filter by project (not yet implemented — returns all)
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '0') || null

  // ── Fetch completed jobs (with their cost and timing) ─────────────────────
  // Join jobs with tasks to compute real core/GPU hours
  const rows = rangeDays
    ? await sql`
        SELECT
          j.id,
          j.job_number,
          j.title,
          j.status,
          j.created_at,
          j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4)   AS cores,
          COALESCE((j.manifest->>'gpus')::numeric,  0)   AS gpus,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN tasks t
          ON t.job_id = j.id
          AND t.completed_at IS NOT NULL
          AND t.started_at   IS NOT NULL
        WHERE j.status IN ('success', 'downloaded', 'done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        GROUP BY j.id
        ORDER BY j.created_at DESC
      `
    : await sql`
        SELECT
          j.id,
          j.job_number,
          j.title,
          j.status,
          j.created_at,
          j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4)   AS cores,
          COALESCE((j.manifest->>'gpus')::numeric,  0)   AS gpus,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN tasks t
          ON t.job_id = j.id
          AND t.completed_at IS NOT NULL
          AND t.started_at   IS NOT NULL
        WHERE j.status IN ('success', 'downloaded', 'done')
        GROUP BY j.id
        ORDER BY j.created_at DESC
      `

  const records = (rows as Record<string, unknown>[]).map(r => {
    const totalSecs  = Number(r.total_secs ?? 0)
    const cores      = Number(r.cores ?? 4)
    const gpus       = Number(r.gpus  ?? 0)
    const coreHours  = (cores * totalSecs) / 3600
    const gpuHours   = (gpus  * totalSecs) / 3600
    const licenseFee = 0  // Blender is free
    // Prefer the stored cost_usd (accurate), fallback to computed
    const storedCost = Number(r.cost_usd ?? 0)
    const computed   = coreHours * CPU_PER_CORE_HR + gpuHours * GPU_PER_GPU_HR
    const total      = storedCost > 0 ? storedCost : computed

    return {
      id:          String(r.id),
      date:        (r.created_at as string).slice(0, 10),  // YYYY-MM-DD
      coreHours:   Number(coreHours.toFixed(4)),
      gpuHours:    Number(gpuHours.toFixed(4)),
      licenseFee,
      total:       Number(total.toFixed(4)),
      job: {
        jobNumber: r.job_number as string,
        title:     r.title     as string,
        project:   { name: 'Default' },
      },
    }
  })

  const totalCost      = records.reduce((s, r) => s + r.total,     0)
  const totalCoreHours = records.reduce((s, r) => s + r.coreHours, 0)
  const totalJobs      = records.length
  const avgCostPerJob  = totalJobs > 0 ? totalCost / totalJobs : 0

  return NextResponse.json({
    records,
    summary: {
      totalCost:      Number(totalCost.toFixed(4)),
      totalCoreHours: Number(totalCoreHours.toFixed(4)),
      totalJobs,
      avgCostPerJob:  Number(avgCostPerJob.toFixed(4)),
    },
  })
}
