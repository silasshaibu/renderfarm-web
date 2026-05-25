import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import type { ManifestData } from '@/lib/api'



type Context = { params: Promise<{ jobNumber: string; taskId: string }> }

// ── Status derivation (fallback when no tasks row exists) ─────────────────────
const DONE_STATUSES    = new Set(['done', 'success', 'downloaded'])
const FAILED_STATUSES  = new Set(['failed'])
const HOLDING_STATUSES = new Set(['holding'])

function deriveTaskStatus(jobStatus: string, frameIdx: number, outputs: string[]): string {
  if (DONE_STATUSES.has(jobStatus))    return 'done'
  if (FAILED_STATUSES.has(jobStatus))  return 'failed'
  if (HOLDING_STATUSES.has(jobStatus)) return 'holding'
  if (outputs[frameIdx])               return 'done'
  if (frameIdx === outputs.length)     return 'running'
  return 'pending'
}

// ── Shared: load job row ──────────────────────────────────────────────────────
async function getJobRow(jobNumber: string) {
  const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber}`
  return rows[0] as Record<string, unknown> | undefined
}

// ── GET /api/jobs/[jobNumber]/tasks/[taskId] ──────────────────────────────────
// Returns { job: ApiJob, task: ApiTask }.
// Reads real timing from the tasks table; falls back to derived values.
export async function GET(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIdx = parseInt(taskId, 10)
  if (isNaN(frameIdx) || frameIdx < 0) {
    return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })
  }

  const row = await getJobRow(jobNumber)
  if (!row) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const jobId   = row.id as number
  const outputs = (row.outputs  as string[])    ?? []
  const manifest = (row.manifest as ManifestData) ?? ({} as ManifestData)

  // ── Try to read real timing from tasks table ──────────────────────────────
  const taskRows = await sql`
    SELECT * FROM tasks WHERE job_id = ${jobId} AND frame_index = ${frameIdx}
  `
  const tr = taskRows[0] as Record<string, unknown> | undefined

  // ── Derive values — prefer tasks table, fall back ─────────────────────────
  const tStatus    = (tr?.status    as string | undefined)
                   ?? deriveTaskStatus(row.status as string, frameIdx, outputs)
  const startedAt  = (tr?.started_at   as string | null) ?? null
  const completedAt = (tr?.completed_at as string | null)
                    ?? (tStatus === 'done' ? (row.updated_at as string | null) : null)
  const outputUrl  = (tr?.output_url as string | undefined)?.trim()
                   || outputs[frameIdx]
                   || null

  // Duration in seconds (null if timing not available)
  const duration = startedAt && completedAt
    ? Math.round(
        (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      )
    : null

  // Actual frame number
  const frameStr    = (row.frames as string) ?? '1-1'
  const parts       = frameStr.replace(/\s/g, '').split('-')
  const frameStart  = parseInt(parts[0]) || 1
  const actualFrame = (tr?.frame_number as number | undefined) ?? (frameStart + frameIdx)

  // uploadedFiles from manifest assets (same for every task in this job)
  const uploadedFiles = (manifest.assets ?? []).map((a, i) => ({
    id:   String(i),
    path: a.path,
  }))

  const task = {
    id:           `${row.id}-${frameIdx}`,
    taskNumber:   taskId,
    frame:        actualFrame,
    status:       tStatus,
    outputPath:   outputUrl,
    startedAt,
    completedAt,
    uploadedFiles,
    executions: [{
      id:        `${row.id}-${frameIdx}-1`,
      attempt:   1,
      status:    tStatus,
      startedAt,
      duration,
    }],
  }

  const job = {
    id:                String(row.id),
    jobNumber:         row.job_number,
    title:             row.title,
    status:            row.status,
    frames:            row.frames,
    software:          row.software,
    priority:          row.priority           ?? 5,
    createdAt:         row.created_at,
    blenderFile:       row.blender_file       ?? '',
    outputs,
    manifest,
    assetsTotal:       row.assets_total       ?? 0,
    assetsUploaded:    row.assets_uploaded     ?? 0,
    outputPath:        row.output_path         ?? '',
    workerHost:        row.worker_host         ?? '',
    statusDescription: row.status_description ?? '',
  }

  return NextResponse.json({ job, task })
}

// ── PUT /api/jobs/[jobNumber]/tasks/[taskId] ──────────────────────────────────
// Worker upserts per-frame timing. Called:
//   • Before render  — { status: "running", frame_number, worker_host }
//   • After upload   — { status: "done",    frame_number, output_url, worker_host }
export async function PUT(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIdx = parseInt(taskId, 10)
  if (isNaN(frameIdx)) return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })

  const row = await getJobRow(jobNumber)
  if (!row) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const jobId = row.id as number

  const body = await req.json() as {
    status?:       string
    frame_number?: number
    output_url?:   string
    worker_host?:  string
  }

  const status      = body.status      ?? 'pending'
  const frameNumber = body.frame_number ?? (frameIdx + 1)
  const outputUrl   = body.output_url  ?? ''
  const workerHost  = body.worker_host ?? ''

  const isRunning   = status === 'running'
  const isCompleted = status === 'done' || status === 'success' || status === 'failed'

  if (isRunning) {
    // Insert with started_at = NOW(); on conflict keep existing started_at (don't reset)
    await sql`
      INSERT INTO tasks (job_id, frame_index, frame_number, status, started_at, worker_host)
      VALUES (${jobId}, ${frameIdx}, ${frameNumber}, 'running', NOW(), ${workerHost})
      ON CONFLICT (job_id, frame_index) DO UPDATE
      SET status      = 'running',
          started_at  = COALESCE(tasks.started_at, NOW()),
          worker_host = COALESCE(NULLIF(${workerHost}, ''), tasks.worker_host)
    `
  } else if (isCompleted) {
    await sql`
      INSERT INTO tasks (job_id, frame_index, frame_number, status, completed_at, output_url, worker_host)
      VALUES (${jobId}, ${frameIdx}, ${frameNumber}, ${status}, NOW(), ${outputUrl}, ${workerHost})
      ON CONFLICT (job_id, frame_index) DO UPDATE
      SET status       = ${status},
          completed_at = NOW(),
          output_url   = COALESCE(NULLIF(${outputUrl}, ''), tasks.output_url),
          worker_host  = COALESCE(NULLIF(${workerHost}, ''), tasks.worker_host)
    `
  } else {
    await sql`
      INSERT INTO tasks (job_id, frame_index, frame_number, status, worker_host)
      VALUES (${jobId}, ${frameIdx}, ${frameNumber}, ${status}, ${workerHost})
      ON CONFLICT (job_id, frame_index) DO UPDATE
      SET status      = ${status},
          worker_host = COALESCE(NULLIF(${workerHost}, ''), tasks.worker_host)
    `
  }

  // ── Recompute job cost when any task completes ───────────────────────────────
  // Pricing: $0.03 / core-hour (CPU) + $0.45 / GPU-hour
  if (isCompleted) {
    try {
      const costRows = await sql`
        SELECT COALESCE(
          SUM(EXTRACT(EPOCH FROM (completed_at - started_at))), 0
        ) AS total_secs
        FROM tasks
        WHERE job_id = ${jobId}
          AND completed_at IS NOT NULL
          AND started_at  IS NOT NULL
      `
      const totalSecs = Number((costRows[0] as Record<string, unknown>).total_secs ?? 0)

      // Read cores/gpus from job manifest
      const jobRow   = await getJobRow(jobNumber)
      const manifest = (jobRow?.manifest ?? {}) as ManifestData
      const cores    = Number(manifest.cores ?? 4)
      const gpus     = Number(manifest.gpus  ?? 0)

      // Cost per second of render time
      const costPerSec = (cores * 0.03 / 3600) + (gpus * 0.45 / 3600)
      const costUsd    = Math.max(0, totalSecs * costPerSec)

      await sql`
        UPDATE jobs SET cost_usd = ${costUsd} WHERE id = ${jobId}
      `
    } catch { /* cost update is best-effort */ }
  }

  return NextResponse.json({ ok: true, frameIndex: frameIdx, status })
}
