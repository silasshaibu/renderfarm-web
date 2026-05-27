import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'

const WIPE_KEY = 'rf-wipe-2026-clean'

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== WIPE_KEY) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  await sql`DELETE FROM task_logs`
  await sql`DELETE FROM tasks`
  await sql`DELETE FROM wrangler_events`
  await sql`DELETE FROM jobs`
  await sql`ALTER SEQUENCE jobs_id_seq RESTART WITH 1`
  await sql`ALTER SEQUENCE tasks_id_seq RESTART WITH 1`

  return NextResponse.json({ ok: true, message: 'All jobs wiped. Sequences reset to 1.' })
}
