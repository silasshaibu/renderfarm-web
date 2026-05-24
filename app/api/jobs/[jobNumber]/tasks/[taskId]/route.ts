import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'
import type { ManifestData } from '@/lib/api'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean } }
  catch { return null }
}

// ── Status derivation (mirrors job-detail page logic) ─────────────────────────
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

// ── GET /api/jobs/[jobNumber]/tasks/[taskId] ──────────────────────────────────
// Returns { job: ApiJob, task: ApiTask } derived from the jobs table.
// taskId = 0-based frame index (0-padded string, e.g. "000").
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string; taskId: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber, taskId } = await context.params
  const frameIdx = parseInt(taskId, 10)
  if (isNaN(frameIdx) || frameIdx < 0) {
    return NextResponse.json({ message: 'Invalid task ID' }, { status: 400 })
  }

  const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber}`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const row      = rows[0] as Record<string, unknown>
  const outputs  = (row.outputs  as string[])    ?? []
  const manifest = (row.manifest as ManifestData) ?? ({} as ManifestData)

  const tStatus   = deriveTaskStatus(row.status as string, frameIdx, outputs)
  const outputUrl = outputs[frameIdx] ?? null

  // Actual frame number from range string  (e.g. frames="1-50", idx=0 → frame 1)
  const frameStr   = (row.frames as string) ?? '1-1'
  const parts      = frameStr.replace(/\s/g, '').split('-')
  const frameStart = parseInt(parts[0]) || 1
  const actualFrame = frameStart + frameIdx

  // uploadedFiles: manifest asset list (same for every task of this job)
  const uploadedFiles = (manifest.assets ?? []).map((a, i) => ({
    id: String(i),
    path: a.path,
  }))

  const task = {
    id:           `${row.id}-${frameIdx}`,
    taskNumber:   taskId,
    frame:        actualFrame,
    status:       tStatus,
    outputPath:   outputUrl,
    startedAt:    null,   // gap #8 — needs per-frame tasks table
    completedAt:  tStatus === 'done' ? (row.updated_at as string ?? null) : null,
    uploadedFiles,
    executions: [{
      id:        `${row.id}-${frameIdx}-1`,
      attempt:   1,
      status:    tStatus,
      startedAt: null,
      duration:  null,
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
