import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { killJobVMs } from '@/lib/gcp/compute'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { jobNumber } = await context.params

  const rows = await sql`SELECT id, provider FROM jobs WHERE job_number = ${jobNumber} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  const job = rows[0] as Record<string, unknown>

  // Kill GCP VMs if this is a GCP job
  if (job.provider === 'gcp') {
    try {
      await killJobVMs(String(job.id))
    } catch (err) {
      console.error('[kill] killJobVMs error:', err)
    }
  }

  await sql`
    UPDATE jobs SET status = 'killed', updated_at = NOW()
    WHERE id = ${job.id}
  `

  return NextResponse.json({ ok: true })
}
