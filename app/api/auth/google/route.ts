import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, SESSION_TTL_MS, makeJti } from '@/lib/auth-server'
import { getIP } from '@/lib/rateLimit'
import { grantWelcomeBonus } from '@/lib/credits'

interface GoogleTokenInfo {
  aud: string
  email: string
  email_verified: string | boolean
  name?: string
  given_name?: string
  family_name?: string
  exp: string
}

export async function POST(req: NextRequest) {
  try {
    const { credential } = await req.json() as { credential?: string }
    if (!credential) {
      return NextResponse.json({ message: 'Missing Google credential' }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ message: 'Google sign-in is not configured.' }, { status: 500 })
    }

    // Verify the ID token with Google
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`)
    if (!verifyRes.ok) {
      return NextResponse.json({ message: 'Invalid Google token' }, { status: 401 })
    }
    const info = await verifyRes.json() as GoogleTokenInfo

    // Validate audience + expiry + email verification
    if (info.aud !== clientId) {
      return NextResponse.json({ message: 'Google token audience mismatch' }, { status: 401 })
    }
    if (Number(info.exp) * 1000 < Date.now()) {
      return NextResponse.json({ message: 'Google token expired' }, { status: 401 })
    }
    const emailVerified = info.email_verified === true || info.email_verified === 'true'
    if (!info.email || !emailVerified) {
      return NextResponse.json({ message: 'Google account email not verified' }, { status: 401 })
    }

    await initDB()
    const email = info.email.toLowerCase()
    const name  = info.name ?? [info.given_name, info.family_name].filter(Boolean).join(' ')

    // Ensure optional columns exist
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name         TEXT DEFAULT ''`.catch(() => null)
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT ''`.catch(() => null)
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

    // Find or create the user
    let rows = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1` as Record<string, unknown>[]
    let isNew = false

    if (!rows.length) {
      // Create — random password hash (they can set one via reset later)
      const randomHash = await bcrypt.hash(makeJti() + Date.now(), 10)
      const acctName   = name || email.split('@')[0]
      rows = await sql`
        INSERT INTO users (email, password_hash, is_admin, name, account_name)
        VALUES (${email}, ${randomHash}, FALSE, ${name}, ${acctName})
        RETURNING *
      ` as Record<string, unknown>[]
      isNew = true
    }

    const user = rows[0] as {
      id: number; email: string; is_admin: boolean
      is_super_admin?: boolean; status?: string; suspension_reason?: string
    }

    if (user.status === 'suspended') {
      return NextResponse.json(
        { message: `Your account has been suspended. Reason: ${user.suspension_reason ?? 'Contact support.'}` },
        { status: 403 }
      )
    }

    // Grant welcome bonus for brand-new Google users
    if (isNew) {
      const firstName = (info.given_name ?? name ?? 'there').split(' ')[0]
      await grantWelcomeBonus(user.id, email, firstName).catch(() => null)
    }

    // Strict 1-session-per-user
    await sql`DELETE FROM user_sessions WHERE user_id = ${user.id}`.catch(() => null)

    const ip        = getIP(req.headers)
    const userAgent = req.headers.get('user-agent') ?? ''
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    const jti       = makeJti()

    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, isSuperAdmin: Boolean(user.is_super_admin), jti },
      JWT_SECRET,
      { expiresIn: '90d' },
    )

    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at, source, last_used_at)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()}, 'dashboard', NOW())
      ON CONFLICT (jti) DO NOTHING
    `

    return NextResponse.json({
      access_token,
      user: { id: String(user.id), email: user.email, isAdmin: user.is_admin },
    })
  } catch (err) {
    console.error('[auth/google] error:', err)
    return NextResponse.json({ message: 'Google sign-in failed' }, { status: 500 })
  }
}
