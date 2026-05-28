import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, jobCompleteEmail } from '@/lib/email'
import { spawnChunkVMs } from '@/lib/gcp/compute'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { parseFrameRange, chunkFrames, resolveScoutFrames } from '@/lib/utils/frames'



// Map a DB row → the ApiJob shape the frontend expects
function rowToJob(row: Record<string, unknown>) {
  return {
    id:                 String(row.id),
    jobNumber:          row.job_number,
    title:              row.title,
    status:             row.status,
    frames:             row.frames,
    software:           row.software,
    priority:           row.priority           ?? 5,
    createdAt:          row.created_at,
    blenderFile:        row.blender_file ?? '',
    outputs:            (row.outputs as string[]) ?? [],
    manifest:           row.manifest ?? {},
    assetsTotal:        row.assets_total    ?? 0,
    assetsUploaded:     row.assets_uploaded ?? 0,
    outputPath:         row.output_path         ?? '',
    workerHost:         row.worker_host          ?? '',
    statusDescription:  row.status_description   ?? '',
    costUsd:            Number(row.cost_usd      ?? 0),
    provider:           (row.provider as string)  ?? 'renderfarm',
    gcsScenePath:       (row.gcs_scene_path as string) ?? '',
    heldFrames:         (row.held_frames as number[]) ?? [],
    avgFrameSec:        row.avg_frame_sec != null ? Number(row.avg_frame_sec) : null,
    projectId:          row.project_id != null ? Number(row.project_id) : null,
    taskCount:          row.task_count  != null ? Number(row.task_count)  : null,
  }
}

// GET /api/jobs — list all jobs, or single job with ?jobNumber=RF-XXXX
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const jobNumber = req.nextUrl.searchParams.get('jobNumber')
  if (jobNumber) {
    const rows = await sql`
      SELECT j.*,
        COUNT(DISTINCT tc.id)                                                     AS task_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))))          AS avg_frame_sec
      FROM jobs j
      LEFT JOIN tasks tc ON tc.job_id = j.id
      LEFT JOIN tasks t  ON t.job_id  = j.id
        AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
      WHERE j.job_number = ${jobNumber}
      GROUP BY j.id
      LIMIT 1
    `
    if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
    return NextResponse.json(rowToJob(rows[0] as Record<string, unknown>))
  }

  const rows = await sql`
    SELECT j.*,
      COUNT(DISTINCT tc.id)                                                     AS task_count,
      ROUND(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at))))          AS avg_frame_sec
    FROM jobs j
    LEFT JOIN tasks tc ON tc.job_id = j.id
    LEFT JOIN tasks t  ON t.job_id  = j.id
      AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL
    GROUP BY j.id
    ORDER BY j.created_at DESC
  `
  return NextResponse.json(rows.map(r => rowToJob(r as Record<string, unknown>)))
}

// POST /api/jobs — create a new job (called by the Blender addon after upload)
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const data = await req.json() as {
    title?:              string
    frames?:             string
    software?:           string
    blender_file?:       string
    output_folder?:      string   // Blender addon sends this
    status?:             string
    manifest?:           Record<string, unknown>
    assets_total?:       number
    assets_uploaded?:    number
    status_description?: string
    provider?:           string   // 'renderfarm' | 'gcp'
    gcs_scene_path?:     string   // GCS path after direct upload e.g. jobs/abc/scene.blend
    machine_type?:       string   // GCP machine type e.g. 'n1-standard-4'
    preemptible?:        boolean
    project_id?:         number | string  // required — must be an active project
    projectId?:          number | string  // camelCase alias sent by SubmissionKit renderfarm path
    project?:            number | string  // string ID alias sent by the Blender addon
    chunk_size?:         number           // top-level field sent by Blender addon
    scout_frames?:       string           // top-level field sent by Blender addon
    use_scout_frames?:   boolean          // top-level field sent by Blender addon
  }

  // ── Project validation — every job must belong to an active project ─────────
  const rawProjectId = data.project_id ?? data.projectId ?? data.project
  const projectIdNum = rawProjectId ? Number(rawProjectId) : null
  if (!projectIdNum) {
    return NextResponse.json(
      { message: 'A project is required to submit a job. Please create and activate a project in Admin → Projects first.' },
      { status: 400 }
    )
  }
  const projectRows = await sql`
    SELECT id FROM projects WHERE id = ${projectIdNum} AND is_active = TRUE LIMIT 1
  `
  if (!projectRows.length) {
    return NextResponse.json(
      { message: 'Project not found or not active. Select an active project before submitting.' },
      { status: 400 }
    )
  }

  // Validate status — all 12 Conductor statuses + legacy DB names
  const VALID_STATUSES = [
    'queued', 'done',                                        // legacy
    'upload_pending', 'uploading', 'sync_pending',
    'sync_failed', 'syncing', 'pending', 'holding',
    'running', 'success', 'downloaded', 'failed', 'preempted',
  ]
  const status = (data.status && VALID_STATUSES.includes(data.status))
    ? data.status
    : 'queued'

  // Generate next RF-XXXX number
  const countRows = await sql`SELECT COUNT(*) AS cnt FROM jobs`
  const nextNum   = Number((countRows[0] as Record<string, unknown>).cnt) + 1
  const jobNumber = `RF-${String(nextNum).padStart(4, '0')}`

  const manifest           = data.manifest ? JSON.stringify(data.manifest) : '{}'
  const assetsTotal        = data.assets_total    ?? 0
  const assetsUploaded     = data.assets_uploaded  ?? 0
  const outputPath         = data.output_folder    ?? ''
  const statusDescription  = data.status_description ?? ''
  const provider           = data.provider         ?? 'renderfarm'
  const gcsScenePath       = data.gcs_scene_path   ?? ''

  const rows = await sql`
    INSERT INTO jobs (
      job_number, title, frames, software, blender_file, status,
      manifest, assets_total, assets_uploaded,
      output_path, status_description, provider, gcs_scene_path,
      project_id
    )
    VALUES (
      ${jobNumber},
      ${data.title        ?? 'Untitled Job'},
      ${data.frames       ?? '1-1'},
      ${data.software     ?? 'blender-4-1'},
      ${data.blender_file ?? ''},
      ${status},
      ${manifest}::jsonb,
      ${assetsTotal},
      ${assetsUploaded},
      ${outputPath},
      ${statusDescription},
      ${provider},
      ${gcsScenePath},
      ${projectIdNum}
    )
    RETURNING *
  `

  const job = rowToJob(rows[0] as Record<string, unknown>)

  // ── Auto-dispatch GCP VMs using chunk + scout architecture ─────────────────
  if (gcsScenePath) {
    try {
      const allFrames   = parseFrameRange(data.frames ?? '1-1')
      const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'
      const machineType = data.machine_type ?? 'n1-standard-4'
      const preemptible = data.preemptible  ?? true
      const software    = data.software     ?? 'blender-4-1'
      // chunk_size and scout_frames may be top-level (Blender addon) or inside manifest (SubmissionKit)
      const chunkSize   = Number(data.chunk_size ?? (data.manifest as Record<string, unknown> | undefined)?.chunk_size ?? 1)
      const useScouts   = data.use_scout_frames ?? true
      const rawScout    = data.scout_frames ?? String((data.manifest as Record<string, unknown> | undefined)?.scout_frames ?? '')
      const scoutExpr   = useScouts ? rawScout : ''

      const scoutFrames = resolveScoutFrames(scoutExpr, allFrames)
      const chunks      = chunkFrames(allFrames, chunkSize, scoutFrames)
      const hasScouts   = scoutFrames.length > 0

      // Pre-create ALL task rows: scouts = pending, non-scouts = held (if scouts defined)
      const jobIdInt = Number(job.id)
      for (const chunk of chunks) {
        const taskStatus = (!hasScouts || chunk.isScout) ? 'pending' : 'held'
        await sql`
          INSERT INTO tasks (job_id, frame_index, frame_number, chunk_index, start_frame, end_frame, status, is_scout)
          VALUES (${jobIdInt}, ${chunk.index}, ${chunk.startFrame}, ${chunk.index}, ${chunk.startFrame}, ${chunk.endFrame}, ${taskStatus}, ${chunk.isScout})
          ON CONFLICT (job_id, frame_index) DO NOTHING
        `
      }

      // Update status to running BEFORE spawning VMs so it's always correct
      await sql`
        UPDATE jobs
        SET status      = 'running',
            held_frames = '[]'::jsonb,
            updated_at  = NOW()
        WHERE id = ${job.id}
      `

      // Spawn VMs only for scout chunks (or all if no scouts configured)
      const toDispatch = hasScouts ? chunks.filter(c => c.isScout) : chunks
      try {
        await spawnChunkVMs(
          String(job.id), toDispatch, gcsScenePath,
          machineType, preemptible, appUrl, INTERNAL_SECRET, software
        )
      } catch (vmErr) {
        const msg = vmErr instanceof Error ? vmErr.message : String(vmErr)
        console.error('[jobs POST] GCP VM spawn failed:', msg)
        // Write the error into status_description so dashboard shows it
        await sql`
          UPDATE jobs
          SET status_description = ${'VM spawn failed: ' + msg},
              updated_at         = NOW()
          WHERE id = ${job.id}
        `
      }
    } catch (err) {
      console.error('[jobs POST] GCP dispatch failed:', err)
    }
  }

  return NextResponse.json({ jobNumber: job.jobNumber, id: job.id }, { status: 201 })
}

// PATCH /api/jobs?id= — render worker (or dashboard) updates job fields
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json() as {
    status?:             string
    outputs?:            string[]
    assets_uploaded?:    number
    manifest?:           Record<string, unknown>
    worker_host?:        string
    status_description?: string
    priority?:           number
  }

  // manifest: merge new keys into existing jsonb (don't replace the whole object)
  const manifestPatch = body.manifest ? JSON.stringify(body.manifest) : null

  const rows = await sql`
    UPDATE jobs
    SET status             = COALESCE(${body.status             ?? null}, status),
        outputs            = COALESCE(${body.outputs            ? JSON.stringify(body.outputs) : null}::jsonb, outputs),
        assets_uploaded    = COALESCE(${body.assets_uploaded    ?? null}, assets_uploaded),
        manifest           = CASE WHEN ${manifestPatch}::text IS NOT NULL
                               THEN manifest || ${manifestPatch}::jsonb
                               ELSE manifest END,
        worker_host        = COALESCE(${body.worker_host        ?? null}, worker_host),
        status_description = COALESCE(${body.status_description ?? null}, status_description),
        priority           = COALESCE(${body.priority           ?? null}, priority),
        updated_at         = NOW()
    WHERE id = ${id}
    RETURNING *
  `

  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const updatedJob = rowToJob(rows[0] as Record<string, unknown>)

  // Send job-complete email when the worker marks a job 'success'
  if (body.status === 'success') {
    try {
      // Look up the job owner's email via the user_id stored in the job manifest,
      // or fall back to looking up by the authenticated user's sub.
      const ownerRows = await sql`
        SELECT u.email FROM users u
        INNER JOIN jobs j ON j.manifest->>'submitter_email' = u.email
                         OR u.id = ${(rows[0] as Record<string,unknown>).id}
        WHERE j.id = ${id}
        LIMIT 1
      ` as Record<string, unknown>[]

      // Simpler: look up the user who owns this token (the worker reuses the artist's token)
      const userRows = await sql`SELECT email FROM users WHERE id = ${user.sub} LIMIT 1` as Record<string, unknown>[]
      const ownerEmail = (userRows[0]?.email ?? ownerRows[0]?.email) as string | undefined

      if (ownerEmail) {
        const outputs = (updatedJob.outputs ?? []) as string[]
        await sendEmail({
          to:      ownerEmail,
          subject: `Render complete: ${updatedJob.jobNumber}`,
          html:    jobCompleteEmail({
            email:      ownerEmail,
            jobNumber:  String(updatedJob.jobNumber),
            title:      String(updatedJob.title),
            frameCount: outputs.length,
          }),
        })
      }
    } catch { /* email is best-effort */ }
  }

  return NextResponse.json(updatedJob)
}
