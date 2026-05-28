import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, makeJti } from '@/lib/auth-server'
import { rateLimit, getIP, retryMessage } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 })
    }

    await initDB()   // ensures tables exist + seeds default user on first run

    // ── Rate limiting: 10 attempts per IP per 15 minutes ─────────────────────
    const ip = getIP(req.headers)
    const rl = await rateLimit(`login:${ip}`, 10, 15 * 60)
    if (!rl.allowed) {
      return NextResponse.json(
        { message: retryMessage(rl.retryAfter) },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    if (!rows.length) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const user  = rows[0] as { id: number; email: string; password_hash: string; is_admin: boolean; status?: string; suspension_reason?: string }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    // ── Suspension check ──────────────────────────────────────────────────
    if (user.status === 'suspended') {
      return NextResponse.json(
        { message: `Your account has been suspended. Reason: ${user.suspension_reason ?? 'Contact support.'}` },
        { status: 403 }
      )
    }

    const jti          = makeJti()
    const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)   // 7 days
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    // Clear invited flag on first login
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN DEFAULT FALSE`.catch(() => null)
    await sql`UPDATE users SET invited = FALSE WHERE id = ${user.id} AND invited = TRUE`.catch(() => null)

    // Dedup sessions: reuse existing valid session for same user+IP instead of accumulating
    const existingSess = await sql`
      SELECT id, jti FROM user_sessions
      WHERE user_id = ${user.id} AND ip_address = ${ip}
        AND revoked = FALSE AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1
    ` as Record<string, unknown>[]

    if (existingSess.length > 0) {
      // Extend the existing session rather than creating a new one
      const ex = existingSess[0]
      await sql`UPDATE user_sessions SET expires_at = ${expiresAt.toISOString()} WHERE id = ${ex.id}`
      const reuseToken = jwt.sign(
        { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti: ex.jti },
        JWT_SECRET,
        { expiresIn: '7d' },
      )
      // Check 2FA then return reused token
      let requires2faSetup2 = false
      try {
        const tfaRows = await sql`SELECT value FROM wrangler_settings WHERE key = 'require2fa' LIMIT 1` as Record<string, unknown>[]
        if (tfaRows.length > 0 && tfaRows[0].value === true) {
          const secretRow = await sql`SELECT totp_secret FROM users WHERE id = ${user.id}`.catch(() => [])
          const secret = ((secretRow as Record<string, unknown>[])[0] as Record<string, unknown> | undefined)?.totp_secret
          if (!secret) requires2faSetup2 = true
        }
      } catch { /* ignore */ }
      return NextResponse.json({
        access_token: reuseToken,
        user: { id: String(user.id), email: user.email, isAdmin: user.is_admin },
        requires2faSetup: requires2faSetup2,
      })
    }

    // Store session for admin session management (reuse ip from rate-limit check above)
    const userAgent = req.headers.get('user-agent') ?? ''
    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()})
      ON CONFLICT (jti) DO NOTHING
    `

    // Check account-level require_2fa setting
    let requires2faSetup = false
    try {
      const tfaRows = await sql`
        SELECT value FROM wrangler_settings WHERE key = 'require2fa' LIMIT 1
      ` as Record<string, unknown>[]
      const tfaOn = tfaRows.length > 0 && tfaRows[0].value === true
      if (tfaOn) {
        // If the user has no totp_secret column yet, flag setup required
        const tfaCols = await sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'totp_secret'
        `
        if (!tfaCols.length) {
          requires2faSetup = true   // column doesn't exist → no one has 2FA set up
        } else {
          const secretRow = await sql`SELECT totp_secret FROM users WHERE id = ${user.id}`
          const secret = (secretRow[0] as Record<string, unknown>)?.totp_secret
          if (!secret) requires2faSetup = true
        }
      }
    } catch { /* ignore — 2FA is best-effort */ }

    return NextResponse.json({
      access_token,
      user:               { id: String(user.id), email: user.email, isAdmin: user.is_admin },
      requires2faSetup,   // frontend shows a notice if true
    })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
