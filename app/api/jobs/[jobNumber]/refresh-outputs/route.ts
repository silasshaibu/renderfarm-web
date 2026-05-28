import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { getSignedDownloadUrls } from '@/lib/gcp/storage'
import { syncJobStatus } from '@/lib/jobs/sync'

type Context = { params: Promise<{ jobNumber: string }> }

/** POST /api/jobs/[jobNumber]/refresh-outputs
 *  Scans GCS for completed frames, writes fresh signed URLs, and syncs job status.
 *  Called by the Companion App Downloader when a job has completed tasks but empty outputs.
 */
export async function POST(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { jobNumber } = await context.params
  const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job      = rows[0] as Record<string, unknown>
  const jobId    = String(job.id)
  const jobIdInt = Number(job.id)

  const outputs = await getSignedDownloadUrls(jobId)

  if (outputs.length) {
    await sql`
      UPDATE jobs
      SET outputs    = ${JSON.stringify(outputs)}::jsonb,
          updated_at = NOW()
      WHERE id = ${jobId}
    `
  }

  // Also sync job status from real task states
  await syncJobStatus(jobIdInt, jobId, job.status as string)

  // Re-read updated status to return to caller
  const updated = await sql`SELECT status FROM jobs WHERE id = ${jobId} LIMIT 1`
  const newStatus = (updated[0] as Record<string, unknown>).status as string

  return NextResponse.json({ ok: true, count: outputs.length, status: newStatus })
}
