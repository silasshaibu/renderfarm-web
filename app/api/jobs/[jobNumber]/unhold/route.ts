import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { spawnJobVMs } from '@/lib/gcp/compute'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { parseFrameRange } from '@/lib/utils/frames'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { jobNumber } = await context.params

  const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job          = rows[0] as Record<string, unknown>
  const gcsScenePath = job.gcs_scene_path as string

  if (!gcsScenePath) {
    return NextResponse.json({ message: 'No scene file — cannot start rendering' }, { status: 400 })
  }

  // All frames in this job
  const allFrames = parseFrameRange(job.frames as string)

  // Skip frames that already completed successfully
  const doneTasks = await sql`
    SELECT frame_number FROM tasks
    WHERE job_id = ${job.id} AND status IN ('complete', 'done', 'success')
  ` as Record<string, unknown>[]
  const doneNums     = new Set(doneTasks.map(r => Number(r.frame_number)))
  const remaining    = allFrames.filter(f => !doneNums.has(f))

  if (!remaining.length) {
    await sql`UPDATE jobs SET status = 'success', updated_at = NOW() WHERE id = ${job.id}`
    return NextResponse.json({ ok: true, message: 'All frames already complete — job marked success' })
  }

  const manifest    = (job.manifest as Record<string, unknown>) ?? {}
  const machineType = (manifest.machine_type as string)  ?? 'n1-standard-4'
  const preemptible = (manifest.preemptible  as boolean) ?? true
  const software    = (job.software as string)           ?? 'blender-4-1'
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL    ?? 'https://renderfarm-web.vercel.app'

  await spawnJobVMs(
    String(job.id), remaining, gcsScenePath,
    machineType, preemptible, appUrl, INTERNAL_SECRET, software
  )

  await sql`
    UPDATE jobs
    SET status      = 'running',
        held_frames = '[]'::jsonb,
        updated_at  = NOW()
    WHERE id = ${job.id}
  `

  return NextResponse.json({ ok: true, dispatched: remaining.length })
}
