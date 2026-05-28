import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// ── GET /api/admin/sessions ───────────────────────────────────────────────────
// Returns all active (non-revoked, non-expired) sessions with user info.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

  const rows = await sql`
    SELECT
      s.id, s.ip_address, s.user_agent, s.created_at, s.expires_at,
      s.source, s.last_used_at,
      u.id    AS user_id,
      u.email AS user_email,
      u.name  AS user_name
    FROM   user_sessions s
    JOIN   users u ON u.id = s.user_id
    WHERE  s.revoked    = FALSE
      AND  s.expires_at > NOW()
    ORDER  BY s.created_at DESC
    LIMIT  200
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:         String(r.id),
    ip:         r.ip_address ?? '',
    userAgent:  r.user_agent ?? '',
    createdAt:  r.created_at,
    expiresAt:  r.expires_at,
    lastUsedAt: r.last_used_at ?? null,
    source:     (r.source as string) || 'dashboard',
    user: {
      id:    String(r.user_id),
      email: r.user_email,
      name:  r.user_name ?? '',
    },
  })))
}
