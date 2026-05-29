/**
 * POST /api/auth/token — Blender addon authentication endpoint.
 *
 * Matches the same 1-session-per-user policy as /api/auth/login:
 * logging in from the addon replaces any existing session (browser or addon).
 * 24-hour expiry, sliding renewal handled by verifyToken on every request.
 */
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, SESSION_TTL_MS, makeJti } from '@/lib/auth-server'
import { rateLimit, getIP, retryMessage } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }
    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 })
    }

    await initDB()

    const ip = getIP(req.headers)
    const rl = await rateLimit(`login:${ip}`, 10, 15 * 60)
    if (!rl.allowed) {
      return NextResponse.json(
        { message: retryMessage(rl.retryAfter) },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    if (!rows.length) return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })

    const user = rows[0] as {
      id: number; email: string; password_hash: string
      is_admin: boolean; status?: string; suspension_reason?: string
    }

    if (!await bcrypt.compare(password, user.password_hash)) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { message: `Your account has been suspended. Reason: ${user.suspension_reason ?? 'Contact support.'}` },
        { status: 403 }
      )
    }

    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

    // Strict 1-session-per-user: replace all existing sessions
    await sql`DELETE FROM user_sessions WHERE user_id = ${user.id}`.catch(() => null)

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    const jti       = makeJti()

    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '90d' },
    )

    const userAgent = req.headers.get('user-agent') ?? ''
    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at, source, last_used_at)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()}, 'addon', NOW())
      ON CONFLICT (jti) DO NOTHING
    `

    return NextResponse.json({
      access_token,
      user: { id: String(user.id), email: user.email, isAdmin: user.is_admin },
    })
  } catch (err) {
    console.error('Token error:', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
