import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// ── GET /api/wrangler-events ──────────────────────────────────────────────────
// Returns the 100 most recent wrangler events. Admin only.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  await initDB()

  const rows = await sql`
    SELECT id, wrangler, job_number, action, detail, created_at
    FROM   wrangler_events
    ORDER  BY created_at DESC
    LIMIT  100
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:        String(r.id),
    wrangler:  r.wrangler,
    jobNumber: r.job_number,
    action:    r.action,
    detail:    r.detail,
    ts:        r.created_at,
  })))
}

// ── POST /api/wrangler-events ─────────────────────────────────────────────────
// Called by the render worker to record wrangler actions.
// Requires a valid JWT (the worker uses the artist's token).
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as {
    wrangler?:   string
    job_number?: string
    action?:     string
    detail?:     string
  }

  if (!body.wrangler || !body.job_number || !body.action) {
    return NextResponse.json(
      { message: 'wrangler, job_number, and action are required' },
      { status: 400 },
    )
  }

  const rows = await sql`
    INSERT INTO wrangler_events (wrangler, job_number, action, detail)
    VALUES (
      ${body.wrangler},
      ${body.job_number},
      ${body.action},
      ${body.detail ?? ''}
    )
    RETURNING id, created_at
  ` as Record<string, unknown>[]

  return NextResponse.json({ id: rows[0].id, createdAt: rows[0].created_at }, { status: 201 })
}
