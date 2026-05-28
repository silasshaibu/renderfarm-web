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

  // ── Cost calculation using calculator pricing model ───────────────────────
  // rate = (cores*0.048 + ramGb*0.006 + gpuHourly) * gcpMult(0.95)
  const GPU_HOURLY: Record<string, number> = {
    't4-1':        0.80,
    'v100-1':      2.40,
    'l4-1':        2.00,
    'a100-40gb-1': 3.20,
    'a100-80gb-1': 3.20,
  }
  const MACHINE_SPECS: Record<string, { vcpu: number; ramGb: number }> = {
    'n1-standard-4':  { vcpu: 4,  ramGb: 15 },
    'n1-standard-8':  { vcpu: 8,  ramGb: 30 },
    'n1-standard-16': { vcpu: 16, ramGb: 60 },
    'g2-standard-8':  { vcpu: 8,  ramGb: 32 },
    'a2-highgpu-1g':  { vcpu: 12, ramGb: 85 },
    'a2-ultragpu-1g': { vcpu: 12, ramGb: 85 },
  }
  function calcTaskCost(machineTypeId: string, durationSec: number): number {
    if (durationSec <= 0) return 0
    // Resolve machine type id → GCP type → specs
    const MT_TO_GCP: Record<string, string> = {
      't4-1':        'n1-standard-4',
      'v100-1':      'n1-standard-8',
      'l4-1':        'g2-standard-8',
      'a100-40gb-1': 'a2-highgpu-1g',
      'a100-80gb-1': 'a2-ultragpu-1g',
    }
    const gcpType = MT_TO_GCP[machineTypeId] ?? machineTypeId
    const specs   = MACHINE_SPECS[gcpType] ?? { vcpu: 4, ramGb: 15 }
    const gpuCost = GPU_HOURLY[machineTypeId] ?? 0
    const rate    = (specs.vcpu * 0.048 + specs.ramGb * 0.006 + gpuCost) * 0.95
    return (durationSec / 3600) * rate
  }

  const body = await req.json() as {
    jobId:        string
    status:       string
    chunkIndex?:  number
    startFrame?:  number
    endFrame?:    number
    frame?:       number   // legacy single-frame compat
    machineType?: string
  }
  const { jobId } = body
  // Normalise 'complete' → 'success' so the dashboard always shows 'success'
  const status      = body.status === 'complete' ? 'success' : body.status
  const chunkIndex  = body.chunkIndex ?? 0
  const startFrame  = body.startFrame ?? body.frame ?? 1
  const endFrame    = body.endFrame   ?? startFrame
  const machineType = body.machineType ?? ''

  const jobRows2 = await sql`SELECT id FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows2.length) return NextResponse.json({ ok: true })
  const jobIdInt = Number((jobRows2[0] as Record<string, unknown>).id)

  // Compute cost from actual duration (started_at set by task-start signal)
  const taskRow = await sql`
    SELECT started_at FROM tasks WHERE job_id = ${jobIdInt} AND frame_index = ${chunkIndex} LIMIT 1
  `
  const startedAt   = taskRow[0] ? (taskRow[0] as Record<string, unknown>).started_at as Date | null : null
  const durationSec = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0
  const costUsd     = calcTaskCost(machineType, durationSec)

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, chunk_index, start_frame, end_frame, status, completed_at, cost_usd)
    VALUES (${jobIdInt}, ${chunkIndex}, ${startFrame}, ${chunkIndex}, ${startFrame}, ${endFrame}, ${status}, NOW(), ${costUsd})
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET status = ${status}, completed_at = NOW(), cost_usd = ${costUsd},
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
    // All chunks done — force success and sum task costs into job
    const totalCostRow = await sql`SELECT COALESCE(SUM(cost_usd),0) AS total FROM tasks WHERE job_id = ${jobIdInt}`
    const totalCost = Number((totalCostRow[0] as Record<string, unknown>).total)
    await sql`
      UPDATE jobs SET status = 'success', cost_usd = ${totalCost}, updated_at = NOW() WHERE id = ${jobId}
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
