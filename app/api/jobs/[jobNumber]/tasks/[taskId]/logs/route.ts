import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



type Context = { params: Promise<{ jobNumber: string; taskId: string }> }

// ── GET /api/jobs/[jobNumber]/tasks/[taskId]/logs ─────────────────────────────
// Returns log lines for a specific task (frame).
// Optional ?after=<id> for incremental polling (returns only rows with id > after).
export async function GET(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIdx = parseInt(taskId, 10)
  if (isNaN(frameIdx)) return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })

  const jobRows = await sql`SELECT id FROM jobs WHERE job_number = ${jobNumber}`
  if (!jobRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const jobId = (jobRows[0] as { id: number }).id

  const after = req.nextUrl.searchParams.get('after')

  const rows = after
    ? await sql`
        SELECT id, log_line, level, created_at
        FROM   task_logs
        WHERE  job_id = ${jobId} AND frame_number = ${frameIdx} AND id > ${Number(after)}
        ORDER  BY id ASC
      `
    : await sql`
        SELECT id, log_line, level, created_at
        FROM   task_logs
        WHERE  job_id = ${jobId} AND frame_number = ${frameIdx}
        ORDER  BY id ASC
      `

  return NextResponse.json(
    (rows as Record<string, unknown>[]).map(r => ({
      id:        String(r.id),
      line:      r.log_line  as string,
      level:     r.level     as string,
      timestamp: r.created_at as string,
    }))
  )
}

// ── POST /api/jobs/[jobNumber]/tasks/[taskId]/logs ────────────────────────────
// Render worker submits log lines while/after rendering a frame.
// Body: { lines: string[], level?: 'info'|'warn'|'error' }
//    or { line: string,  level?: '...' }
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIdx = parseInt(taskId, 10)
  if (isNaN(frameIdx)) return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })

  const jobRows = await sql`SELECT id FROM jobs WHERE job_number = ${jobNumber}`
  if (!jobRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const jobId = (jobRows[0] as { id: number }).id

  const body  = await req.json() as { lines?: string[]; line?: string; level?: string }
  const level = body.level ?? 'info'
  const lines = body.lines ?? (body.line ? [body.line] : [])

  if (!lines.length) return NextResponse.json({ inserted: 0 })

  let inserted = 0
  for (const line of lines) {
    if (typeof line === 'string' && line.trim()) {
      await sql`
        INSERT INTO task_logs (job_id, frame_number, log_line, level)
        VALUES (${jobId}, ${frameIdx}, ${line}, ${level})
      `
      inserted++
    }
  }

  return NextResponse.json({ inserted }, { status: 201 })
}
