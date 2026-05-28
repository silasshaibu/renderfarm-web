import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/profile/sessions — return current user's active sessions
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
  await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

  const rows = await sql`
    SELECT id, ip_address, user_agent, created_at, expires_at, jti, source, last_used_at
    FROM user_sessions
    WHERE user_id = ${user.sub}
      AND revoked = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 50
  ` as Record<string, unknown>[]

  const currentJti = user.jti ?? ''

  return NextResponse.json(rows.map(r => ({
    id:          r.id,
    ip:          r.ip_address ?? '',
    userAgent:   r.user_agent ?? '',
    createdAt:   r.created_at,
    expiresAt:   r.expires_at,
    lastUsedAt:  r.last_used_at ?? null,
    isCurrent:   r.jti === currentJti,
    source:      (r.source as string) || 'dashboard',
  })))
}

// DELETE /api/profile/sessions — revoke a session by id
// Body: { id: number } or query param ?all=true to sign out all other sessions
export async function DELETE(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'

  if (all) {
    // Sign out all sessions EXCEPT the current one
    await sql`
      UPDATE user_sessions
      SET revoked = TRUE
      WHERE user_id = ${user.sub}
        AND jti <> ${user.jti ?? ''}
        AND revoked = FALSE
    `
    // Also blocklist them
    await sql`
      INSERT INTO token_blocklist (jti)
      SELECT jti FROM user_sessions
      WHERE user_id = ${user.sub}
        AND jti <> ${user.jti ?? ''}
      ON CONFLICT (jti) DO NOTHING
    `
    return NextResponse.json({ ok: true })
  }

  const body = await req.json().catch(() => ({})) as { id?: number }
  if (!body.id) return NextResponse.json({ message: 'id required' }, { status: 400 })

  // Only allow revoking your own sessions
  const rows = await sql`
    SELECT jti, expires_at, jti = ${user.jti ?? ''} AS is_current
    FROM user_sessions WHERE id = ${body.id} AND user_id = ${user.sub}
  ` as Record<string, unknown>[]
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const sess = rows[0]
  await sql`UPDATE user_sessions SET revoked = TRUE WHERE id = ${body.id}`
  await sql`
    INSERT INTO token_blocklist (jti) VALUES (${sess.jti})
    ON CONFLICT (jti) DO NOTHING
  `

  return NextResponse.json({ ok: true, isCurrent: Boolean(sess.is_current) })
}
