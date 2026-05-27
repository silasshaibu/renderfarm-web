import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { killTaskVM } from '@/lib/gcp/compute'
import { parseFrameRange } from '@/lib/utils/frames'

type Context = { params: Promise<{ jobNumber: string; taskId: string }> }

/** POST /api/jobs/[jobNumber]/tasks/[taskId]/kill — terminate VM + mark task killed */
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIndex = parseInt(taskId, 10)
  if (isNaN(frameIndex) || frameIndex < 0) {
    return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })
  }

  const jobRows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job         = jobRows[0] as Record<string, unknown>
  const frames      = parseFrameRange(job.frames as string)
  const frameNumber = frames[frameIndex]

  if (frameNumber == null) {
    return NextResponse.json({ message: 'Frame index out of range' }, { status: 400 })
  }

  // Best-effort VM termination (may already be gone if it self-deleted)
  try {
    await killTaskVM(String(job.id), frameNumber)
  } catch { /* logged inside killTaskVM */ }

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, status, completed_at)
    VALUES (${job.id}, ${frameIndex}, ${frameNumber}, 'killed', NOW())
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET status = 'killed', completed_at = NOW()
  `

  return NextResponse.json({ ok: true, frameNumber, status: 'killed' })
}
