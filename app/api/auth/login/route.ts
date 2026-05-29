import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, makeJti } from '@/lib/auth-server'
import { rateLimit, getIP, retryMessage } from '@/lib/rateLimit'

const SESSION_HARD_LIMIT = 5   // max total sessions per user across all sources
const SOURCE    = 'dashboard'
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

async function flagRapidSessions(userId: number, ip: string) {
  try {
    const rows = await sql`
      SELECT COUNT(*) AS cnt FROM user_sessions
      WHERE user_id = ${userId} AND created_at > NOW() - INTERVAL '24 hours'
    ` as Record<string, unknown>[]
    const count = Number((rows[0] as Record<string, unknown>)?.cnt ?? 0)
    if (count > 3) {
      await sql`
        INSERT INTO abuse_signals (user_id, signal_type, description, ip_address, metadata)
        VALUES (
          ${userId},
          'rapid_session_creation',
          ${`User created ${count} sessions in 24 hours — possible credential sharing or account compromise`},
          ${ip},
          ${JSON.stringify({ session_count: count, window: '24h' })}
        )
      `.catch(() => null)
    }
  } catch { /* non-fatal */ }
}

async function enforceSessionLimit(userId: number) {
  // Keep only the 5 most recently used sessions per user
  await sql`
    DELETE FROM user_sessions
    WHERE user_id = ${userId}
      AND id NOT IN (
        SELECT id FROM user_sessions
        WHERE user_id = ${userId}
          AND revoked = FALSE
          AND expires_at > NOW()
        ORDER BY last_used_at DESC NULLS LAST
        LIMIT ${SESSION_HARD_LIMIT}
      )
      AND revoked = FALSE
      AND expires_at > NOW()
  `.catch(() => null)
}

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

    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'dashboard'`.catch(() => null)
    await sql`ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

    // Clear invited flag on first login
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN DEFAULT FALSE`.catch(() => null)
    await sql`UPDATE users SET invited = FALSE WHERE id = ${user.id} AND invited = TRUE`.catch(() => null)

    const expiresAt = new Date(Date.now() + EXPIRY_MS)

    const check2fa = async (): Promise<boolean> => {
      try {
        const tfaRows = await sql`SELECT value FROM wrangler_settings WHERE key = 'require2fa' LIMIT 1` as Record<string, unknown>[]
        if (!tfaRows.length || tfaRows[0].value !== true) return false
        const secretRow = await sql`SELECT totp_secret FROM users WHERE id = ${user.id}`.catch(() => [])
        return !((secretRow as Record<string, unknown>[])[0] as Record<string, unknown> | undefined)?.totp_secret
      } catch { return false }
    }

    // REPLACE approach for dashboard: delete the old session, issue a fresh one.
    // This ensures each browser login gets a clean session (new device = new session).
    await sql`
      DELETE FROM user_sessions
      WHERE user_id = ${user.id}
        AND source = ${SOURCE}
        AND revoked = FALSE
        AND expires_at > NOW()
    `.catch(() => null)

    const jti          = makeJti()
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    const userAgent = req.headers.get('user-agent') ?? ''
    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at, source)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()}, ${SOURCE})
      ON CONFLICT (jti) DO NOTHING
    `

    // Enforce hard cap and check for rapid creation in background
    await enforceSessionLimit(user.id)
    void flagRapidSessions(user.id, ip)

    return NextResponse.json({
      access_token,
      user:             { id: String(user.id), email: user.email, isAdmin: user.is_admin },
      requires2faSetup: await check2fa(),
    })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
