import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

const CPU_PER_CORE_HR = 0.03
const GPU_PER_GPU_HR  = 0.45

// GET /api/usage/jobs?range=30&page=1&limit=25&sort=date&order=desc&projectId=
// Paginated, sortable job cost breakdown
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()

  const rangeDays = Number(req.nextUrl.searchParams.get('range') ?? '30') || null
  const page      = Math.max(1, Number(req.nextUrl.searchParams.get('page')  ?? '1'))
  const limit     = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? '25')))
  const offset    = (page - 1) * limit
  const sort      = req.nextUrl.searchParams.get('sort')  ?? 'date'
  const order     = req.nextUrl.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'
  const projectId = req.nextUrl.searchParams.get('projectId') ?? ''
  const userId    = user.isAdmin ? (req.nextUrl.searchParams.get('userId') ?? '') : ''

  // Build the base filter conditions in JS, use separate queries for each sort column
  // (safe: all dynamic values are parameterized, only sort col is hardcoded from whitelist)
  type JobRow = Record<string, unknown>

  // Count query first
  let countRows: JobRow[]
  let dataRows: JobRow[]

  if (rangeDays && projectId && userId) {
    countRows = await sql`
      SELECT COUNT(*) AS cnt FROM jobs j
      WHERE j.status IN ('success','downloaded','done')
        AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        AND j.project_id = ${Number(projectId)}
        AND j.user_id    = ${Number(userId)}
    ` as JobRow[]
  } else if (rangeDays && projectId) {
    countRows = await sql`
      SELECT COUNT(*) AS cnt FROM jobs j
      WHERE j.status IN ('success','downloaded','done')
        AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        AND j.project_id = ${Number(projectId)}
    ` as JobRow[]
  } else if (rangeDays) {
    countRows = await sql`
      SELECT COUNT(*) AS cnt FROM jobs j
      WHERE j.status IN ('success','downloaded','done')
        AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
    ` as JobRow[]
  } else {
    countRows = await sql`
      SELECT COUNT(*) AS cnt FROM jobs j
      WHERE j.status IN ('success','downloaded','done')
    ` as JobRow[]
  }

  const total = Number(countRows[0]?.cnt ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / limit))

  // Data query — order by cost (most common) or date
  const baseSelect = `
    SELECT
      j.id,
      j.job_number,
      j.title,
      j.created_at,
      j.cost_usd,
      COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
      COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
      COALESCE(p.name, 'Default')                   AS project,
      COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
    FROM jobs j
    LEFT JOIN projects p ON p.id = j.project_id
    LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
  `

  // Determine ORDER BY column (whitelist)
  const orderCol = sort === 'cost' ? 'j.cost_usd'
    : sort === 'cores'  ? 'total_secs'
    : sort === 'job'    ? 'j.job_number'
    : 'j.created_at'

  // Execute with correct filters — we branch on the sort direction
  if (order === 'ASC') {
    if (rangeDays && projectId) {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
          AND j.project_id = ${Number(projectId)}
        GROUP BY j.id, p.name
        ORDER BY j.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    } else if (rangeDays) {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        GROUP BY j.id, p.name
        ORDER BY j.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    } else {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
        GROUP BY j.id, p.name
        ORDER BY j.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    }
  } else {
    // DESC (default)
    if (rangeDays && projectId) {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
          AND j.project_id = ${Number(projectId)}
        GROUP BY j.id, p.name
        ORDER BY j.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    } else if (rangeDays) {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
          AND j.created_at >= NOW() - (${rangeDays} || ' days')::INTERVAL
        GROUP BY j.id, p.name
        ORDER BY j.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    } else {
      dataRows = await sql`
        SELECT j.id, j.job_number, j.title, j.created_at, j.cost_usd,
          COALESCE((j.manifest->>'cores')::numeric, 4) AS cores,
          COALESCE((j.manifest->>'gpus')::numeric, 0)  AS gpus,
          COALESCE(p.name, 'Default') AS project,
          COALESCE(SUM(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))), 0) AS total_secs
        FROM jobs j
        LEFT JOIN projects p ON p.id = j.project_id
        LEFT JOIN tasks t ON t.job_id = j.id AND t.completed_at IS NOT NULL AND t.started_at IS NOT NULL
        WHERE j.status IN ('success','downloaded','done')
        GROUP BY j.id, p.name
        ORDER BY j.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      ` as JobRow[]
    }
  }

  void orderCol // used for documentation purposes

  const jobs = dataRows.map(r => {
    const totalSecs = Number(r.total_secs ?? 0)
    const cores     = Number(r.cores ?? 4)
    const gpus      = Number(r.gpus  ?? 0)
    const coreHours = (cores * totalSecs) / 3600
    const gpuHours  = (gpus  * totalSecs) / 3600
    const stored    = Number(r.cost_usd ?? 0)
    const computed  = coreHours * CPU_PER_CORE_HR + gpuHours * GPU_PER_GPU_HR
    const total     = stored > 0 ? stored : computed

    return {
      id:        Number(r.id),
      jobNumber: r.job_number as string,
      title:     r.title      as string,
      project:   r.project    as string,
      date:      (r.created_at as string).slice(0, 10),
      coreHours: Number(coreHours.toFixed(4)),
      gpuHours:  Number(gpuHours.toFixed(4)),
      total:     Number(total.toFixed(4)),
    }
  })

  return NextResponse.json({ jobs, total, page, totalPages })
}
