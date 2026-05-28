/**
 * GET /api/auth/cleanup — session maintenance cron job (runs hourly via vercel.json).
 *
 * Step 1: Delete all expired sessions.
 * Step 2: Backfill — for each (user_id, source) keep only the most recent valid session,
 *         deleting older duplicates accumulated before the dedup fix landed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest) {
  // Protect against arbitrary callers; Vercel cron passes the secret automatically
  // when set via CRON_SECRET env var. Also allow internal calls with no auth in dev.
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  await initDB()

  // Ensure columns exist before querying them
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

  // Step 1: delete expired sessions
  const deleted = await sql`
    DELETE FROM user_sessions WHERE expires_at < NOW()
    RETURNING id
  ` as Record<string, unknown>[]

  // Step 2: backfill — per (user_id, source) keep only the newest valid session
  const dupes = await sql`
    DELETE FROM user_sessions
    WHERE id NOT IN (
      SELECT DISTINCT ON (user_id, source) id
      FROM user_sessions
      WHERE expires_at > NOW() AND revoked = FALSE
      ORDER BY user_id, source, created_at DESC
    )
    AND expires_at > NOW()
    AND revoked = FALSE
    RETURNING id
  ` as Record<string, unknown>[]

  return NextResponse.json({
    ok: true,
    expiredDeleted:   deleted.length,
    duplicatesRemoved: dupes.length,
  })
}
