import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'

// POST /api/auth/reset-password
// Body: { token: string, password: string }
export async function POST(req: NextRequest) {
  await initDB()

  const body = await req.json().catch(() => ({})) as { token?: string; password?: string }
  const { token, password } = body

  if (!token?.trim()) {
    return NextResponse.json({ message: 'Reset token is required' }, { status: 400 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 })
  }

  // Load token row
  let rows: Record<string, unknown>[]
  try {
    rows = await sql`
      SELECT * FROM password_resets
      WHERE token = ${token}
        AND used = FALSE
        AND expires_at > NOW()
      LIMIT 1
    ` as Record<string, unknown>[]
  } catch {
    return NextResponse.json({ message: 'Invalid or expired reset link' }, { status: 400 })
  }

  if (!rows.length) {
    return NextResponse.json({ message: 'Invalid or expired reset link' }, { status: 400 })
  }

  const reset  = rows[0]
  const userId = reset.user_id as number

  // Hash the new password
  const hash = await bcrypt.hash(password, 12)

  // Update the user's password
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`

  // Mark token used
  await sql`UPDATE password_resets SET used = TRUE WHERE token = ${token}`

  // Optionally revoke all existing sessions for this user for security
  try {
    const sessions = await sql`
      SELECT jti FROM user_sessions
      WHERE user_id = ${userId} AND revoked = FALSE
    ` as Record<string, unknown>[]

    for (const s of sessions) {
      if (s.jti) {
        await sql`INSERT INTO token_blocklist (jti) VALUES (${s.jti as string}) ON CONFLICT DO NOTHING`
      }
    }
    await sql`UPDATE user_sessions SET revoked = TRUE WHERE user_id = ${userId}`
  } catch { /* best-effort — don't fail the reset */ }

  return NextResponse.json({ ok: true, message: 'Password updated. Please sign in with your new password.' })
}
