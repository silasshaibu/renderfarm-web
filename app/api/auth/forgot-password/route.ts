import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, passwordResetEmail, baseUrl } from '@/lib/email'
import { rateLimit, getIP } from '@/lib/rateLimit'

// ── Ensure the table exists lazily (no schema migration needed) ───────────────
async function ensureResetTable() {
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
}

// POST /api/auth/forgot-password
// Always returns 200 regardless of whether the email exists — prevents enumeration.
export async function POST(req: NextRequest) {
  await initDB()
  await ensureResetTable()

  const body = await req.json().catch(() => ({})) as { email?: string }
  const email = body.email?.trim().toLowerCase() ?? ''

  if (!email) {
    return NextResponse.json({ message: 'Email is required' }, { status: 400 })
  }

  // ── Rate limiting: 5 attempts per IP per hour ─────────────────────────────
  // Return 200 regardless (no 429 exposed) to avoid revealing the limit via timing
  const ip = getIP(req.headers)
  const rl = await rateLimit(`forgot:${ip}`, 5, 60 * 60)
  if (!rl.allowed) {
    return NextResponse.json({ ok: true })   // silent — same response as success
  }

  // Look up user — if not found, return 200 anyway (silent)
  const rows = await sql`SELECT id, email FROM users WHERE email = ${email} LIMIT 1`
  if (!rows.length) {
    return NextResponse.json({ ok: true })
  }

  const user = rows[0] as { id: number; email: string }

  // Invalidate any previous unused tokens for this user
  await sql`
    DELETE FROM password_resets WHERE user_id = ${user.id} AND used = FALSE
  `

  // Generate a secure token (UUID v4)
  const token     = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await sql`
    INSERT INTO password_resets (token, user_id, email, expires_at)
    VALUES (${token}, ${user.id}, ${user.email}, ${expiresAt.toISOString()})
  `

  const resetUrl = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`

  await sendEmail({
    to:      user.email,
    subject: 'Reset your Renderfarm password',
    html:    passwordResetEmail(resetUrl),
  })

  return NextResponse.json({ ok: true })
}
