import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

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
    }

    const { firstName, lastName, email, password, accountName, company, country, phone } = body

    // ── Validation ────────────────────────────────────────────────────────────
    if (!firstName?.trim()) return NextResponse.json({ message: 'First name is required' },   { status: 400 })
    if (!lastName?.trim())  return NextResponse.json({ message: 'Last name is required' },    { status: 400 })
    if (!email?.trim())     return NextResponse.json({ message: 'Email is required' },        { status: 400 })
    if (!password)          return NextResponse.json({ message: 'Password is required' },     { status: 400 })
    if (password.length < 8)return NextResponse.json({ message: 'Password must be at least 8 characters' }, { status: 400 })
    if (!accountName?.trim())return NextResponse.json({ message: 'Account name is required' }, { status: 400 })

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

    // ── Create user ───────────────────────────────────────────────────────────
    const name         = `${firstName.trim()} ${lastName.trim()}`
    const passwordHash = await bcrypt.hash(password, 10)

    const rows = await sql`
      INSERT INTO users (email, password_hash, is_admin, name, account_name, company, country, phone)
      VALUES (
        ${emailNorm},
        ${passwordHash},
        FALSE,
        ${name},
        ${accountName.trim()},
        ${company?.trim() ?? ''},
        ${country?.trim() ?? ''},
        ${phone?.trim()   ?? ''}
      )
      RETURNING id, email, is_admin
    `

    const user = rows[0] as { id: number; email: string; is_admin: boolean }

    // ── Auto sign-in — return a JWT so the client can log straight in ─────────
    const access_token = jwt.sign(
      { sub: String(user.id), email: user.email, isAdmin: user.is_admin },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    return NextResponse.json(
      { access_token, user: { id: String(user.id), email: user.email, isAdmin: user.is_admin } },
      { status: 201 },
    )
  } catch (err) {
    console.error('[register]', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
