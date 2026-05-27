import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { spawnJobVMs } from '@/lib/gcp/compute'
import { parseFrameRange } from '@/lib/utils/frames'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'

export const maxDuration = 300 // Vercel Pro — VM spawning can take a few seconds per frame

// POST { jobId: string, machineType?: string, preemptible?: boolean }
// Parses the job's frame range and spawns one VM per frame
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobId, machineType = 'n1-standard-4', preemptible = true } =
    await req.json() as { jobId?: string; machineType?: string; preemptible?: boolean }

  if (!jobId) return NextResponse.json({ message: 'jobId is required' }, { status: 400 })

  // Load the job
  const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job = rows[0] as Record<string, unknown>
  const gcsScenePath = job.gcs_scene_path as string
  const frameSpec    = job.frames as string

  if (!gcsScenePath) {
    return NextResponse.json({ message: 'Job has no GCS scene path — upload the scene file first' }, { status: 400 })
  }

  const frames = parseFrameRange(frameSpec)
  if (!frames.length) {
    return NextResponse.json({ message: `Could not parse frame range: ${frameSpec}` }, { status: 400 })
  }

  // Spawn ALL frames in parallel immediately — no scout gate.
  // Use the "Scout Frames" button on the job page if you want a preview render first.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'

  try {
    const vmNames = await spawnJobVMs(jobId, frames, gcsScenePath, machineType, preemptible, appUrl, INTERNAL_SECRET)

    await sql`
      UPDATE jobs
      SET status      = 'running',
          held_frames = '[]'::jsonb,
          updated_at  = NOW()
      WHERE id = ${jobId}
    `

    return NextResponse.json({
      ok:          true,
      scoutFrames: [frames[0]],
      totalFrames: frames.length,
      vmCount:     vmNames.length,
    })
  } catch (err) {
    console.error('[gcp/dispatch]', err)
    await sql`UPDATE jobs SET status = 'failed', updated_at = NOW() WHERE id = ${jobId}`
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to dispatch VMs' },
      { status: 500 }
    )
  }
}
