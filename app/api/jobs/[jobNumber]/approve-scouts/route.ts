import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { spawnChunkVMs } from '@/lib/gcp/compute'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import type { TaskChunk } from '@/lib/utils/frames'

type Context = { params: Promise<{ jobNumber: string }> }

/**
 * POST /api/jobs/[jobNumber]/approve-scouts
 * Releases all held tasks: changes status held → pending and spawns their VMs.
 * Called when admin/user clicks "Approve Scout Frames" on the dashboard.
 */
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber } = await context.params
  const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job          = rows[0] as Record<string, unknown>
  const jobId        = String(job.id)
  const jobIdInt     = Number(job.id)
  const gcsScenePath = job.gcs_scene_path as string

  if (!gcsScenePath) {
    return NextResponse.json({ message: 'No scene file on this job' }, { status: 400 })
  }

  // Find all held tasks
  const heldRows = await sql`
    SELECT chunk_index, start_frame, end_frame, is_scout
    FROM tasks
    WHERE job_id = ${jobIdInt} AND status = 'held'
    ORDER BY chunk_index
  ` as Record<string, unknown>[]

  if (!heldRows.length) {
    return NextResponse.json({ ok: true, message: 'No held tasks to release', released: 0 })
  }

  // Mark all held tasks as pending
  await sql`
    UPDATE tasks
    SET status     = 'pending',
        started_at = NULL
    WHERE job_id = ${jobIdInt} AND status = 'held'
  `

  // Build TaskChunk list for VM spawning
  const manifest    = (job.manifest as Record<string, unknown>) ?? {}
  const machineType = (manifest.machine_type as string)  ?? 'n1-standard-4'
  const preemptible = (manifest.preemptible  as boolean) ?? true
  const software    = (job.software as string)           ?? 'blender-4-1'
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL    ?? 'https://renderfarm-web.vercel.app'

  const chunks: TaskChunk[] = heldRows.map(r => ({
    index:      Number(r.chunk_index),
    frames:     [],   // not needed for VM spawn
    startFrame: Number(r.start_frame),
    endFrame:   Number(r.end_frame),
    isScout:    Boolean(r.is_scout),
  }))

  await spawnChunkVMs(jobId, chunks, gcsScenePath, machineType, preemptible, appUrl, INTERNAL_SECRET, software)

  await sql`
    UPDATE jobs SET status = 'running', updated_at = NOW() WHERE id = ${jobId}
  `

  return NextResponse.json({ ok: true, released: heldRows.length })
}
