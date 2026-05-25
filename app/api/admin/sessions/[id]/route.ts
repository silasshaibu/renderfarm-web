import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// ── DELETE /api/admin/sessions/[id] ──────────────────────────────────────────
// Revoke a session: mark it revoked in user_sessions and add its jti to the
// token_blocklist so subsequent requests with that token are rejected.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await verifyToken(req)
  if (!caller || !caller.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()

  // Look up the session to get its jti
  const rows = await sql`
    SELECT jti FROM user_sessions WHERE id = ${id} LIMIT 1
  ` as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ message: 'Session not found' }, { status: 404 })

  const jti = rows[0].jti as string

  // Mark revoked in user_sessions
  await sql`UPDATE user_sessions SET revoked = TRUE WHERE id = ${id}`

  // Add to blocklist so in-flight tokens are rejected
  await sql`
    INSERT INTO token_blocklist (jti) VALUES (${jti})
    ON CONFLICT (jti) DO NOTHING
  `

  return NextResponse.json({ ok: true })
}
