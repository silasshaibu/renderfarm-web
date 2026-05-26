import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { getSignedDownloadUrls } from '@/lib/gcp/storage'

// GET — returns fresh signed GCS download URLs for a completed GCP job.
// URLs expire after 1 hour so this endpoint refreshes them on demand.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { jobNumber } = await context.params

  const rows = await sql`SELECT id, provider, status FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job = rows[0] as Record<string, unknown>

  if (job.provider !== 'gcp') {
    return NextResponse.json({ message: 'Not a GCP job' }, { status: 400 })
  }
  if (job.status !== 'success') {
    return NextResponse.json({ message: 'Job is not complete yet', status: job.status }, { status: 400 })
  }

  const urls = await getSignedDownloadUrls(String(job.id))
  return NextResponse.json({ urls })
}
