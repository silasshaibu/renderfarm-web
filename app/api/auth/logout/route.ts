import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql } from '@/lib/db'

// POST /api/auth/logout
// Adds the token's jti to the blocklist so it is rejected on every subsequent request.
// The client still clears localStorage, but now the token is truly dead server-side.
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)

  // Even if the token is already invalid we return 200 — logout should never fail visibly
  if (user?.jti) {
    try {
      await sql`
        INSERT INTO token_blocklist (jti)
        VALUES (${user.jti})
        ON CONFLICT DO NOTHING
      `
      await sql`
        UPDATE user_sessions SET revoked = TRUE WHERE jti = ${user.jti}
      `
    } catch {
      // best-effort — don't block the logout flow
    }
  }

  return NextResponse.json({ ok: true })
}
