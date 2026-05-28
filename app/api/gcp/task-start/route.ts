import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { syncJobStatus } from '@/lib/jobs/sync'

// POST { jobId, frame }
// Called by the VM startup script just before Blender starts rendering.
// Sets started_at so the dashboard can show elapsed time.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const { jobId, frame } = await req.json() as { jobId: string; frame: number }

  const jobRows = await sql`SELECT id, status FROM jobs WHERE id = ${jobId} LIMIT 1`
  if (!jobRows.length) return NextResponse.json({ ok: true })
  const job      = jobRows[0] as Record<string, unknown>
  const jobIdInt = Number(job.id)

  await sql`
    INSERT INTO tasks (job_id, frame_index, frame_number, status, started_at)
    VALUES (${jobIdInt}, ${frame - 1}, ${frame}, 'running', NOW())
    ON CONFLICT (job_id, frame_index)
    DO UPDATE SET status = 'running', started_at = NOW()
  `

  // Sync job status — at least 1 task is now running → job becomes 'running'
  await syncJobStatus(jobIdInt, jobId, job.status as string)

  return NextResponse.json({ ok: true })
}
