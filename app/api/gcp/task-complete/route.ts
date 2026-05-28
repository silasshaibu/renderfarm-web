import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { getSignedDownloadUrls } from '@/lib/gcp/storage'
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

  const body = await req.json() as {
    jobId:       string
    status:      string
    chunkIndex?: number
    startFrame?: number
    endFrame?:   number
    frame?:      number   // legacy single-frame compat
  }
  const { jobId, status } = body
  const chunkIndex = body.chunkIndex ?? 0
  const startFrame = body.startFrame ?? body.frame ?? 1
  const endFrame   = body.endFrame   ?? startFrame

  const jobRows2 = await sql`SELECT id FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows2.length) return NextResponse.json({ ok: true })
  const jobIdInt = Number((jobRows2[0] as Record<string, unknown>).id)

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, chunk_index, start_frame, end_frame, status, completed_at)
    VALUES (${jobIdInt}, ${chunkIndex}, ${startFrame}, ${chunkIndex}, ${startFrame}, ${endFrame}, ${status}, NOW())
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET status = ${status}, completed_at = NOW(),
      start_frame = COALESCE(tasks.start_frame, ${startFrame}),
      end_frame   = COALESCE(tasks.end_frame,   ${endFrame})
  `

  // Load job details
  const jobRows = await sql`SELECT * FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ ok: true })

  const job      = jobRows[0] as Record<string, unknown>
  const manifest = (job.manifest as Record<string, unknown>) ?? {}

  // Total task count = number of pre-created task rows (chunks)
  const totalTaskRows = await sql`SELECT COUNT(*) AS cnt FROM tasks WHERE job_id = ${jobIdInt}`
  const totalTasks = Number((totalTaskRows[0] as Record<string, unknown>).cnt)

  const doneRows = await sql`
    SELECT COUNT(*) AS cnt FROM tasks
    WHERE job_id = ${jobIdInt} AND status IN ('complete', 'success')
  `
  const doneCount = Number((doneRows[0] as Record<string, unknown>).cnt)

  // Always refresh outputs so partial frames are downloadable while running
  const outputs = await getSignedDownloadUrls(jobId)

  if (outputs.length) {
    await sql`
      UPDATE jobs
      SET outputs = ${JSON.stringify(outputs)}::jsonb, updated_at = NOW()
      WHERE id = ${jobId}
    `
  }

  if (doneCount >= totalTasks && totalTasks > 0) {
    // All chunks done — force success
    await sql`
      UPDATE jobs SET status = 'success', updated_at = NOW() WHERE id = ${jobId}
    `
    console.log(`Job ${jobId} complete — ${outputs.length} output files, ${doneCount} chunks done`)
    // Suppress unused var warning — manifest may be used for future billing
    void manifest
  } else {
    // Recompute job status from actual task states (running/pending/holding)
    const jobRow = await sql`SELECT status FROM jobs WHERE id = ${jobId} LIMIT 1`
    const currentStatus = (jobRow[0] as Record<string, unknown>).status as string
    await syncJobStatus(jobIdInt, jobId, currentStatus)
  }

  return NextResponse.json({ ok: true })
}
