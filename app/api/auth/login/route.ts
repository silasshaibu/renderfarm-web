import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, makeJti } from '@/lib/auth-server'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 })
    }

    await initDB()   // ensures tables exist + seeds default user on first run

    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    if (!rows.length) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const user  = rows[0] as { id: number; email: string; password_hash: string; is_admin: boolean }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const jti          = makeJti()
    const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)   // 7 days
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    // Store session for admin session management
    const ip        = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
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
