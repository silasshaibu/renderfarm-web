import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, passwordResetEmail, baseUrl } from '@/lib/email'

// POST /api/profile/reset-password
// Sends a password reset email to the logged-in user's email address.
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      email      TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // Invalidate any existing reset tokens for this user
  await sql`DELETE FROM password_resets WHERE user_id = ${user.sub} AND used = FALSE`

  const token     = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await sql`
    INSERT INTO password_resets (token, user_id, email, expires_at)
    VALUES (${token}, ${user.sub}, ${user.email}, ${expiresAt.toISOString()})
  `

  const resetUrl = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`
  await sendEmail({
    to:      user.email,
    subject: 'Reset your Renderfarm password',
    html:    passwordResetEmail(resetUrl),
  })

  return NextResponse.json({ ok: true })
}
