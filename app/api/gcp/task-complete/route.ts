import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { getSignedDownloadUrls } from '@/lib/gcp/storage'
import { spawnJobVMs } from '@/lib/gcp/compute'
import { syncJobStatus } from '@/lib/jobs/sync'

// POST { jobId, frame, status }
// Called by the VM startup script when a frame finishes rendering.
// Protected by the internal secret — only our VMs can call this.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const { jobId, frame, status } = await req.json() as {
    jobId:  string
    frame:  number
    status: string
  }

  // Upsert the task row — GCP jobs don't pre-create task rows
  const jobRows2 = await sql`SELECT id FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows2.length) return NextResponse.json({ ok: true })
  const jobIdInt = Number((jobRows2[0] as Record<string, unknown>).id)

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, status, completed_at)
    VALUES (${jobIdInt}, ${frame - 1}, ${frame}, ${status}, NOW())
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET status = ${status}, completed_at = NOW()
  `

  // Load job details
  const jobRows = await sql`SELECT * FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ ok: true })

  const job        = jobRows[0] as Record<string, unknown>
  const heldFrames = (job.held_frames as number[]) ?? []
  const frameSpec  = job.frames as string

  // Parse total frames to know when we're done
  const { parseFrameRange } = await import('@/lib/utils/frames')
  const allFrames   = parseFrameRange(frameSpec)
  const totalFrames = allFrames.length

  const doneRows = await sql`
    SELECT COUNT(*) AS cnt FROM tasks
    WHERE job_id = ${jobIdInt} AND status = 'complete'
  `
  const doneCount = Number((doneRows[0] as Record<string, unknown>).cnt)

  // If there are held frames, unhold them now that the scout frame succeeded
  if (heldFrames.length > 0 && doneCount === 1) {
    const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'
    const gcsScenePath = job.gcs_scene_path as string

    await spawnJobVMs(jobId, heldFrames, gcsScenePath, 'n1-standard-4', true, appUrl, INTERNAL_SECRET)

    await sql`
      UPDATE jobs SET held_frames = '[]'::jsonb, updated_at = NOW()
      WHERE id = ${jobId}
    `
  }

  // Always refresh outputs so partial frames are downloadable while running
  const outputs = await getSignedDownloadUrls(jobId)

  if (outputs.length) {
    await sql`
      UPDATE jobs
      SET outputs = ${JSON.stringify(outputs)}::jsonb, updated_at = NOW()
      WHERE id = ${jobId}
    `
  }

  if (doneCount >= totalFrames) {
    // All frames done — force success regardless of syncJobStatus
    await sql`
      UPDATE jobs SET status = 'success', updated_at = NOW() WHERE id = ${jobId}
    `
    console.log(`Job ${jobId} complete — ${outputs.length} frames`)
  } else {
    // Recompute job status from actual task states (running/pending/holding)
    const jobRow = await sql`SELECT status FROM jobs WHERE id = ${jobId} LIMIT 1`
    const currentStatus = (jobRow[0] as Record<string, unknown>).status as string
    await syncJobStatus(jobIdInt, jobId, currentStatus)
  }

  return NextResponse.json({ ok: true })
}
