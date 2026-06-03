import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { parseFrameSpec, frameCount } from '@/lib/frames'

type Params = { params: Promise<{ jobNumber: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { jobNumber }  = await params
  const { searchParams } = new URL(req.url)
  const framesParam  = searchParams.get('frames') ?? ''
  const chunkParam   = Number(searchParams.get('chunk') ?? 1)

  await initDB()

  const jobRows = await sql`
    SELECT j.id, j.frames, j.cost_usd, j.user_id, j.manifest,
           ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)))) AS avg_frame_sec,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('success','complete','done')) AS done_tasks
    FROM jobs j
    LEFT JOIN tasks t ON t.job_id = j.id
      AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
    WHERE j.job_number = ${jobNumber}
    GROUP BY j.id
    LIMIT 1
  ` as Record<string, unknown>[]

  if (!jobRows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  const job = jobRows[0]
  if (String(job.user_id) !== String(user.sub) && !user.isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const origFrameCount = frameCount(String(job.frames ?? '1-1'))
  const avgFrameSec    = Number(job.avg_frame_sec ?? 0)
  const newFrames      = parseFrameSpec(framesParam)
  const newFrameCount  = newFrames.length
  const chunk          = Math.max(1, chunkParam)
  const taskCount      = Math.ceil(newFrameCount / chunk)
  const estSec         = avgFrameSec > 0 ? avgFrameSec * newFrameCount : null

  // Simple cost estimate from original cost / original frame count
  const origCost     = Number(job.cost_usd ?? 0)
  const costPerFrame = origFrameCount > 0 ? origCost / origFrameCount : 0
  const estCost      = costPerFrame * newFrameCount

  return NextResponse.json({
    frameCount:       newFrameCount,
    taskCount,
    estimatedSeconds: estSec,
    estimatedCost:    estCost,
    basedOn:          avgFrameSec > 0
      ? `Previous render of ${origFrameCount} frame${origFrameCount !== 1 ? 's' : ''} averaged ${Math.round(avgFrameSec)}s per frame`
      : null,
  })
}
