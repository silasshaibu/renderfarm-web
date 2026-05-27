import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// DELETE /api/admin/wipe-jobs — admin only, one-shot cleanup
export async function DELETE(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  await sql`DELETE FROM task_logs`
  await sql`DELETE FROM tasks`
  await sql`DELETE FROM wrangler_events`
  await sql`DELETE FROM jobs`
  // Reset sequences so job numbers start fresh
  await sql`ALTER SEQUENCE jobs_id_seq RESTART WITH 1`
  await sql`ALTER SEQUENCE tasks_id_seq RESTART WITH 1`

  return NextResponse.json({ ok: true, message: 'All jobs wiped. Sequences reset to 1.' })
}
