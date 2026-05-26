import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { spawnJobVMs } from '@/lib/gcp/compute'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'

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

  const job        = rows[0] as Record<string, unknown>
  const heldFrames = (job.held_frames as number[]) ?? []

  if (!heldFrames.length) {
    return NextResponse.json({ message: 'No held frames to release' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'

  await spawnJobVMs(
    String(job.id),
    heldFrames,
    job.gcs_scene_path as string,
    'n1-standard-4',
    true,
    appUrl,
    INTERNAL_SECRET
  )

  await sql`
    UPDATE jobs
    SET status      = 'running',
        held_frames = '[]'::jsonb,
        updated_at  = NOW()
    WHERE id = ${job.id}
  `

  return NextResponse.json({ ok: true, releasedFrames: heldFrames.length })
}
