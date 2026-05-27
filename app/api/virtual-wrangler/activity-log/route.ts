import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/virtual-wrangler/activity-log
// Returns last 100 wrangler events, newest first. Any authenticated user can read.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rows = await sql`
    SELECT id, wrangler, job_number, action, detail, created_at
    FROM   wrangler_events
    ORDER  BY created_at DESC
    LIMIT  100
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:        String(r.id),
    ts:        r.created_at,
    wrangler:  r.wrangler  as string,
    jobNumber: r.job_number as string,
    action:    r.action    as string,
    detail:    r.detail    as string,
  })))
}

// DELETE /api/virtual-wrangler/activity-log
// Clears all wrangler events. Admin only.
export async function DELETE(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const result = await sql`DELETE FROM wrangler_events RETURNING id` as Record<string, unknown>[]
  return NextResponse.json({ ok: true, deleted: result.length })
}
