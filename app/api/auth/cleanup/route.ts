/**
 * GET /api/auth/cleanup — session maintenance cron (daily via vercel.json).
 *
 * Step 1: Delete all expired sessions.
 * Step 2: Enforce 1-session-per-user hard limit — keep only the most recent
 *         active session per user, delete all others.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { verifyToken } from '@/lib/auth-server'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest) {
  const auth    = req.headers.get('authorization') ?? ''
  const isCron  = CRON_SECRET ? auth === `Bearer ${CRON_SECRET}` : true
  const isAdmin = !isCron ? await verifyToken(req).then(u => u?.isAdmin ?? false).catch(() => false) : false
  if (!isCron && !isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  await initDB()

  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

  // Step 1: delete expired sessions
  const deleted = await sql`
    DELETE FROM user_sessions WHERE expires_at < NOW()
    RETURNING id
  ` as Record<string, unknown>[]

  // Step 2: enforce 1-session-per-user — keep only the newest active session per user
  const dupes = await sql`
    DELETE FROM user_sessions
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_id) id
      FROM user_sessions
      WHERE expires_at > NOW() AND revoked = FALSE
      ORDER BY user_id, last_used_at DESC NULLS LAST
    )
    AND expires_at > NOW()
    AND revoked = FALSE
    RETURNING id
  ` as Record<string, unknown>[]

  return NextResponse.json({
    ok: true,
    expiredDeleted:    deleted.length,
    duplicatesRemoved: dupes.length,
  })
}
