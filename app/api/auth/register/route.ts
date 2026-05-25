import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { JWT_SECRET, makeJti } from '@/lib/auth-server'

function getCallerAdmin(req: NextRequest): boolean {
  // If the request carries a valid admin JWT, the caller is an admin
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return false
  try {
    const p = jwt.verify(token, JWT_SECRET) as { isAdmin?: boolean }
    return Boolean(p.isAdmin)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      firstName?:   string
      lastName?:    string
      email?:       string
      password?:    string
      accountName?: string
      company?:     string
      country?:     string
      phone?:       string
      isAdmin?:     boolean   // only honoured when caller has admin JWT
    }

    const { firstName, lastName, email, password, accountName, company, country, phone } = body

    // ── Validation ────────────────────────────────────────────────────────────
    if (!firstName?.trim()) return NextResponse.json({ message: 'First name is required' },   { status: 400 })
    if (!email?.trim())     return NextResponse.json({ message: 'Email is required' },        { status: 400 })
    if (!password)          return NextResponse.json({ message: 'Password is required' },     { status: 400 })
    if (password.length < 8)return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 })

    const emailNorm = email.trim().toLowerCase()

    await initDB()

    // Ensure extra columns exist on the users table
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name         TEXT DEFAULT ''`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT ''`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company      TEXT DEFAULT ''`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country      TEXT DEFAULT ''`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        TEXT DEFAULT ''`

    // ── Duplicate check ───────────────────────────────────────────────────────
    const existing = await sql`SELECT id FROM users WHERE email = ${emailNorm} LIMIT 1`
    if (existing.length > 0) {
      return NextResponse.json({ message: 'An account with that email already exists' }, { status: 409 })
    }

    // isAdmin only granted when the HTTP caller is already an admin
    const grantAdmin = Boolean(body.isAdmin) && getCallerAdmin(req)

    // ── Create user ───────────────────────────────────────────────────────────
    const name         = [firstName.trim(), (lastName ?? '').trim()].filter(Boolean).join(' ')
    const acctName     = (accountName?.trim() || firstName.trim())
    const passwordHash = await bcrypt.hash(password, 10)

    const rows = await sql`
      INSERT INTO users (email, password_hash, is_admin, name, account_name, company, country, phone)
      VALUES (
        ${emailNorm},
        ${passwordHash},
        ${grantAdmin},
        ${name},
        ${acctName},
        ${company?.trim()  ?? ''},
        ${country?.trim()  ?? ''},
        ${phone?.trim()    ?? ''}
      )
      RETURNING id, email, is_admin
    `

    const user = rows[0] as { id: number; email: string; is_admin: boolean }

    // ── Auto sign-in — return a JWT so the client can log straight in ─────────
    const jti          = makeJti()
    const expiresAt    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin, jti },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    const ip        = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
    const userAgent = req.headers.get('user-agent') ?? ''
    await sql`
      INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at)
      VALUES (${user.id}, ${jti}, ${ip}, ${userAgent}, ${expiresAt.toISOString()})
      ON CONFLICT (jti) DO NOTHING
    `

    return NextResponse.json(
      { access_token, user: { id: String(user.id), email: user.email, isAdmin: user.is_admin } },
      { status: 201 },
    )
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
