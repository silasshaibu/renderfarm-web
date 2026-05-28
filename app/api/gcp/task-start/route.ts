import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { syncJobStatus } from '@/lib/jobs/sync'

// POST { jobId, frame }
// Called by the VM startup script just before Blender starts rendering.
// Sets started_at so the dashboard can show elapsed time.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const body = await req.json() as {
    jobId: string
    chunkIndex?: number
    startFrame?: number
    endFrame?:   number
    frame?:      number   // legacy single-frame compat
  }
  const { jobId } = body
  const chunkIndex = body.chunkIndex ?? 0
  const startFrame = body.startFrame ?? body.frame ?? 1
  const endFrame   = body.endFrame   ?? startFrame

  const jobRows = await sql`SELECT id, status FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ ok: true })
  const job      = jobRows[0] as Record<string, unknown>
  const jobIdInt = Number(job.id)

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, chunk_index, start_frame, end_frame, status, started_at)
    VALUES (${jobIdInt}, ${chunkIndex}, ${startFrame}, ${chunkIndex}, ${startFrame}, ${endFrame}, 'running', NOW())
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET
      status      = 'running',
      started_at  = NOW(),
      start_frame = COALESCE(tasks.start_frame, ${startFrame}),
      end_frame   = COALESCE(tasks.end_frame,   ${endFrame})
  `

  // Sync job status — at least 1 task is now running → job becomes 'running'
  await syncJobStatus(jobIdInt, jobId, job.status as string)

  return NextResponse.json({ ok: true })
}
