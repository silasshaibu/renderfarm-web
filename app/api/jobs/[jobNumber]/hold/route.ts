import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobNumber: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { jobNumber } = await context.params

  const rows = await sql`
    UPDATE jobs SET status = 'holding', updated_at = NOW()
    WHERE job_number = ${jobNumber}
    RETURNING id
  `
  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
