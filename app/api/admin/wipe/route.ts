import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  await sql`TRUNCATE TABLE tasks RESTART IDENTITY CASCADE`
  await sql`TRUNCATE TABLE jobs  RESTART IDENTITY CASCADE`

  return NextResponse.json({ ok: true, message: 'All jobs and tasks deleted. Job numbering resets to RF-0001.' })
}
