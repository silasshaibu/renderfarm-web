import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// POST /api/jobs/[jobNumber]/frames-downloaded
// Called by the Electron downloader after frames land on disk.
// For each task whose full frame range is now downloaded, sets status = 'downloaded'.
// If all tasks are downloaded, promotes the job status to 'downloaded'.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobNumber: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber } = await params
  const { frames } = await req.json() as { frames: number[] }

  if (!frames?.length) return NextResponse.json({ ok: true })

  const downloadedSet = new Set(frames)

  const jobRows = await sql`SELECT id FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ ok: true })
  const jobId = Number((jobRows[0] as Record<string, unknown>).id)

  // Load all tasks for this job
  const tasks = await sql`
    SELECT id, start_frame, end_frame, status FROM tasks WHERE job_id = ${jobId}
  `

  for (const task of tasks) {
    const t = task as Record<string, unknown>
    const sf     = Number(t.start_frame)
    const ef     = Number(t.end_frame)
    const status = String(t.status)

    // Already downloaded — skip
    if (status === 'downloaded') continue

    // Check every frame in this chunk is on disk
    let allPresent = true
    for (let f = sf; f <= ef; f++) {
      if (!downloadedSet.has(f)) { allPresent = false; break }
    }

    if (allPresent) {
      await sql`UPDATE tasks SET status = 'downloaded' WHERE id = ${Number(t.id)}`
    }
  }

  // If every task is now downloaded → mark job downloaded too
  const remaining = await sql`
    SELECT COUNT(*) AS cnt FROM tasks
    WHERE job_id = ${jobId} AND status != 'downloaded'
  `
  if (Number((remaining[0] as Record<string, unknown>).cnt) === 0) {
    await sql`UPDATE jobs SET status = 'downloaded', updated_at = NOW() WHERE id = ${jobId}`
  }

  return NextResponse.json({ ok: true })
}
