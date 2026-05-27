import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { spawnRenderVM } from '@/lib/gcp/compute'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { parseFrameRange } from '@/lib/utils/frames'

type Context = { params: Promise<{ jobNumber: string; taskId: string }> }

/**
 * POST /api/jobs/[jobNumber]/tasks/[taskId]/retry
 *
 * Retries a single failed/killed/preempted task:
 *   1. Resets the task row to pending
 *   2. Spawns a fresh GCP VM for just that frame
 *   3. Sets the job back to 'running' if it was failed
 *
 * taskId = frame_index (0-based, may be zero-padded e.g. "007")
 */
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIndex = parseInt(taskId, 10)
  if (isNaN(frameIndex) || frameIndex < 0) {
    return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })
  }

  // Load the job
  const jobRows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job          = jobRows[0] as Record<string, unknown>
  const gcsScenePath = job.gcs_scene_path as string

  if (!gcsScenePath) {
    return NextResponse.json(
      { message: 'No scene file on this job — cannot retry without a GCS scene path' },
      { status: 400 },
    )
  }

  // Resolve frame index → actual frame number
  const frames      = parseFrameRange(job.frames as string)
  const frameNumber = frames[frameIndex]

  if (frameNumber == null) {
    return NextResponse.json(
      { message: `Frame index ${frameIndex} is out of range for this job` },
      { status: 400 },
    )
  }

  // Reset task record → pending (upsert so it works even if no record existed yet)
  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, status)
    VALUES (${job.id}, ${frameIndex}, ${frameNumber}, 'pending')
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET
      status       = 'pending',
      started_at   = NULL,
      completed_at = NULL,
      worker_host  = ''
  `

  // Revive job if it was fully failed/queued
  await sql`
    UPDATE jobs
    SET status     = 'running',
        updated_at = NOW()
    WHERE id = ${job.id}
      AND status IN ('failed', 'queued', 'pending')
  `

  // Spawn a single VM for this frame
  const manifest    = (job.manifest as Record<string, unknown>) ?? {}
  const machineType = (manifest.machine_type as string)  ?? 'n1-standard-4'
  const preemptible = (manifest.preemptible  as boolean) ?? true
  const software    = (job.software as string)           ?? 'blender-4-1'
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL    ?? 'https://renderfarm-web.vercel.app'

  try {
    const vmName = await spawnRenderVM(
      {
        jobId:        String(job.id),
        frameNumber,
        gcsScenePath,
        machineType,
        preemptible,
        software,
      },
      appUrl,
      INTERNAL_SECRET,
    )

    return NextResponse.json({ ok: true, vmName, frameNumber })
  } catch (err) {
    console.error('[task-retry]', err)

    // Roll task back to failed so the UI reflects the error
    await sql`
      UPDATE tasks
      SET status = 'failed'
      WHERE job_id = ${job.id} AND frame_index = ${frameIndex}
    `

    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to spawn VM for this task' },
      { status: 500 },
    )
  }
}
