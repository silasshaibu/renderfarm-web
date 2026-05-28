/**
 * POST /api/auth/token — Blender addon authentication endpoint.
 *
 * Identical to /api/auth/login but:
 *  - source = 'addon'
 *  - sessions expire after 30 days (so artists don't need to reconnect frequently)
 *  - deduplicates by (user_id, source='addon') so repeated Connect presses
 *    reuse the existing session rather than creating new rows
 */
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
    if (!rows.length) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const user  = rows[0] as { id: number; email: string; password_hash: string; is_admin: boolean; status?: string; suspension_reason?: string }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { message: `Your account has been suspended. Reason: ${user.suspension_reason ?? 'Contact support.'}` },
        { status: 403 }
      )
    }

    // Ensure source column exists
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

    const SOURCE    = 'addon'
    const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000  // 30 days
    const expiresAt = new Date(Date.now() + EXPIRY_MS)

    // Dedup: reuse the most recent valid addon session instead of creating a new row
    const existingSess = await sql`
      SELECT id, jti FROM user_sessions
      WHERE user_id = ${user.id}
        AND source = ${SOURCE}
        AND revoked = FALSE
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    ` as Record<string, unknown>[]

    if (existingSess.length > 0) {
      const ex = existingSess[0]
      await sql`UPDATE user_sessions SET expires_at = ${expiresAt.toISOString()}, last_used_at = NOW() WHERE id = ${ex.id}`
      const reuseToken = jwt.sign(
        { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti: ex.jti },
        JWT_SECRET,
        { expiresIn: '30d' },
      )
      return NextResponse.json({
        access_token: reuseToken,
        user: { id: String(user.id), email: user.email, isAdmin: user.is_admin },
      })
    }

    const jti          = makeJti()
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '30d' },
    )

    const userAgent = req.headers.get('user-agent') ?? ''
    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at, source)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()}, ${SOURCE})
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
