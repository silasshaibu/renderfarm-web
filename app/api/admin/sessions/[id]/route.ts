import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; isAdmin: boolean } }
  catch { return null }
}

// ── DELETE /api/admin/sessions/[id] ──────────────────────────────────────────
// Terminate (invalidate) a user session.
// JWTs are stateless — real invalidation requires a blocklist table or
// short-lived tokens. This endpoint exists so the UI doesn't 404; when
// a token blocklist is added, implement it here.
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  // TODO: add session id to a blocklist table to invalidate the JWT
  void context.params // params available when needed
  return NextResponse.json({ ok: true })
}
