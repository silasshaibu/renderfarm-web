import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureReRenderSchema, parseFrameSpec, chunkFrames, isValidFrameSpec } from '@/lib/frames'
import { spawnChunkVMs } from '@/lib/gcp/compute'

type Params = { params: Promise<{ jobNumber: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { jobNumber } = await params
  await initDB()
  await ensureReRenderSchema(sql as Parameters<typeof ensureReRenderSchema>[0])

  // Load original job
  const origRows = await sql`
    SELECT j.*, u.id AS owner_id
    FROM jobs j
    JOIN users u ON u.id = j.user_id
    WHERE j.job_number = ${jobNumber}
    LIMIT 1
  ` as Record<string, unknown>[]

  if (!origRows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  const orig = origRows[0]

  // Ownership check
  if (String(orig.user_id) !== String(user.sub) && !user.isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    frame_range:   string
    chunk_size?:   number
    scout_frames?: string
    job_title?:    string
    override_settings?: { enabled?: boolean; resolution_x?: number; resolution_y?: number; samples?: number }
    notifications?: { email?: boolean; sound?: boolean; notify_on?: string }
  }

  // Validate frame range
  if (!isValidFrameSpec(body.frame_range ?? '')) {
    return NextResponse.json({ message: 'Invalid frame range' }, { status: 400 })
  }

  const origJobId    = Number(orig.id)
  const origManifest = (orig.manifest as Record<string, unknown>) ?? {}

  // For GCP jobs, gcs_scene_path must exist. For renderfarm, check job_files.
  const provider = String(orig.provider ?? 'renderfarm')
  const gcsPath  = String(orig.gcs_scene_path ?? '')

  let filesReused = 0
  if (provider === 'gcp') {
    if (!gcsPath) {
      return NextResponse.json({ message: 'Original job has no scene file on storage. Re-submit from Blender.' }, { status: 422 })
    }
    filesReused = 1
  } else {
    // Check job_files table
    const fileRows = await sql`
      SELECT COUNT(*) AS cnt FROM job_files
      WHERE job_id = ${origJobId} AND still_exists = TRUE
    ` as Record<string, unknown>[]
    filesReused = Number((fileRows[0] as Record<string, unknown>)?.cnt ?? 0)

    if (filesReused === 0) {
      return NextResponse.json({
        message: 'files_purged',
        detail: 'Original files are no longer on the farm. Re-submit from Blender to re-upload.',
      }, { status: 422 })
    }
  }

  // Count existing re-renders for this original job (or root job)
  const rootId = orig.parent_job_id ? Number(orig.parent_job_id) : origJobId
  const reRenderCountRows = await sql`
    SELECT COUNT(*) AS cnt FROM jobs WHERE parent_job_id = ${rootId}
  ` as Record<string, unknown>[]
  const reRenderNum = Number((reRenderCountRows[0] as Record<string, unknown>)?.cnt ?? 0) + 1

  const chunkSize   = Number(body.chunk_size ?? orig.chunk_size ?? 1)
  const newTitle    = body.job_title ?? `${String(orig.title)} [Re-render ${reRenderNum}]`
  const frameRange  = body.frame_range.trim()
  const scoutFrames = body.scout_frames ?? ''

  const notifEmail  = body.notifications?.email ?? Boolean(orig.notification_email)
  const notifSound  = body.notifications?.sound ?? Boolean(orig.notification_sound)
  const notifOn     = body.notifications?.notify_on ?? String(orig.notification_on ?? 'BOTH')

  // Count jobs to determine next number
  const countRows = await sql`SELECT COUNT(*) AS cnt FROM jobs`
  const nextNum   = Number((countRows[0] as Record<string, unknown>).cnt) + 1
  const newJobNum = `RF-${String(nextNum).padStart(4, '0')}`

  // Inherit settings from original job (with optional overrides)
  const ov = body.override_settings?.enabled ? body.override_settings : {}

  const newJobRows = await sql`
    INSERT INTO jobs (
      job_number, title, frames, software, blender_file, status,
      manifest, output_path, provider, gcs_scene_path,
      project_id, user_id,
      parent_job_id, reused_files_count, rerender_number,
      notification_email, notification_sound, notification_on,
      resolution_x, resolution_y, samples
    ) VALUES (
      ${newJobNum},
      ${newTitle},
      ${frameRange},
      ${orig.software ?? 'blender-4-1'},
      ${orig.blender_file ?? ''},
      'pending',
      ${JSON.stringify({ ...origManifest, rerender: true, parent: jobNumber })}::jsonb,
      ${orig.output_path ?? ''},
      ${provider},
      ${gcsPath},
      ${orig.project_id != null ? Number(orig.project_id) : null},
      ${Number(user.sub)},
      ${rootId},
      ${filesReused},
      ${reRenderNum},
      ${notifEmail},
      ${notifSound},
      ${notifOn},
      ${(ov as Record<string, unknown>).resolution_x ?? orig.resolution_x ?? null},
      ${(ov as Record<string, unknown>).resolution_y ?? orig.resolution_y ?? null},
      ${(ov as Record<string, unknown>).samples ?? orig.samples ?? null}
    )
    RETURNING *
  ` as Record<string, unknown>[]

  const newJob   = newJobRows[0] as Record<string, unknown>
  const newJobId = Number(newJob.id)

  // Copy job_files from original job
  if (provider !== 'gcp' && filesReused > 0) {
    await sql`
      INSERT INTO job_files (job_id, file_path, file_name, md5_hash, file_size, storage_key, still_exists)
      SELECT ${newJobId}, file_path, file_name, md5_hash, file_size, storage_key, still_exists
      FROM job_files
      WHERE job_id = ${origJobId} AND still_exists = TRUE
    `.catch(() => null)
  }

  // Create tasks
  const allFrames  = parseFrameSpec(frameRange)
  const chunks     = chunkFrames(allFrames, chunkSize)
  const scoutSet   = new Set<number>()
  if (scoutFrames.trim()) {
    parseFrameSpec(scoutFrames).forEach(f => scoutSet.add(f))
  }
  const hasScouts = scoutSet.size > 0

  for (let i = 0; i < chunks.length; i++) {
    const [sf, ef] = chunks[i]
    const isScout  = hasScouts && chunks[i].some(f => scoutSet.has(f))
    const status   = hasScouts && !isScout ? 'held' : 'pending'
    await sql`
      INSERT INTO tasks (job_id, frame_index, frame_number, chunk_index, start_frame, end_frame, status)
      VALUES (${newJobId}, ${i}, ${sf}, ${i}, ${sf}, ${ef}, ${status})
      ON CONFLICT DO NOTHING
    `.catch(() => null)
  }

  // Dispatch GCP VMs immediately (files already on storage)
  if (provider === 'gcp' && gcsPath) {
    try {
      const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'
      const machineType = String(origManifest.machine_type ?? 'n1-standard-4')
      const preemptible = Boolean(origManifest.preemptible ?? true)
      const software    = String(orig.software ?? 'blender-4-1')

      await spawnChunkVMs({
        jobId:       String(newJobId),
        jobNumber:   newJobNum,
        gcsPath,
        chunks,
        machineType,
        preemptible,
        software,
        appUrl,
        scoutIndices: hasScouts
          ? chunks.map((c, i) => c.some(f => scoutSet.has(f)) ? i : -1).filter(i => i >= 0)
          : [],
      })
    } catch (e) {
      console.error('[rerender] VM dispatch error:', e)
      // Job is created — VMs can be dispatched later via retry
    }
  }

  return NextResponse.json({
    jobNumber:        newJobNum,
    jobDbId:          newJobId,
    filesReused,
    filesUploaded:    0,
    tasksCreated:     chunks.length,
    startingImmediately: provider === 'gcp',
  })
}
