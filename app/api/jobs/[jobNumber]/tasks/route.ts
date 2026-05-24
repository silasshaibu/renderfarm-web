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

// ── GET /api/jobs/[jobNumber]/tasks ───────────────────────────────────────────
// Returns all task rows for the job, keyed by frame_index.
// Used by the job detail page to show real per-frame timing in the task table.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber } = await context.params

  const jobRows = await sql`SELECT id FROM jobs WHERE job_number = ${jobNumber}`
  if (!jobRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const jobId = (jobRows[0] as { id: number }).id

  const rows = await sql`
    SELECT frame_index, frame_number, status, started_at, completed_at, output_url, worker_host
    FROM   tasks
    WHERE  job_id = ${jobId}
    ORDER  BY frame_index ASC
  `

  // Return a map: { [frameIndex]: { status, startedAt, completedAt, outputUrl, workerHost, durationSec } }
  const result: Record<number, {
    status:      string
    startedAt:   string | null
    completedAt: string | null
    outputUrl:   string
    workerHost:  string
    durationSec: number | null
  }> = {}

  for (const r of rows as Record<string, unknown>[]) {
    const started   = r.started_at   as string | null
    const completed = r.completed_at as string | null
    const duration  = started && completed
      ? Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 1000)
      : null

    result[r.frame_index as number] = {
      status:      r.status      as string,
      startedAt:   started,
      completedAt: completed,
      outputUrl:   (r.output_url  as string) ?? '',
      workerHost:  (r.worker_host as string) ?? '',
      durationSec: duration,
    }
  }

  return NextResponse.json(result)
}
