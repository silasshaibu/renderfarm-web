import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



function splitName(full: string) {
  const parts = (full ?? '').trim().split(/\s+/)
  return {
    firstName: parts[0] ?? '',
    lastName:  parts.slice(1).join(' '),
  }
}

// ── GET /api/profile ──────────────────────────────────────────────────────────
// Returns the current user's profile fields.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  // Ensure optional columns exist
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name         TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company      TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country      TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone        TEXT DEFAULT ''`

  const rows = await sql`SELECT * FROM users WHERE id = ${user.sub}`
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  const r   = rows[0] as Record<string, unknown>
  const { firstName, lastName } = splitName(r.name as string)

  return NextResponse.json({
    id:          String(r.id),
    email:       r.email        as string,
    firstName,
    lastName,
    phone:       (r.phone       as string) ?? '',
    company:     (r.company     as string) ?? '',
    country:     (r.country     as string) ?? '',
    accountName: (r.account_name as string) ?? '',
    isAdmin:     Boolean(r.is_admin),
    createdAt:   r.created_at   as string,
  })
}

// ── PATCH /api/profile ────────────────────────────────────────────────────────
// Updates editable profile fields (name, phone, company, country).
// Email is read-only (change would require verification flow).
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as {
    firstName?: string
    lastName?:  string
    phone?:     string
    company?:   string
    country?:   string
  }

  const firstName = body.firstName?.trim() ?? ''
  const lastName  = body.lastName?.trim()  ?? ''
  const fullName  = [firstName, lastName].filter(Boolean).join(' ')

  await sql`
    UPDATE users
    SET name    = CASE WHEN ${fullName} <> '' THEN ${fullName} ELSE name END,
        phone   = COALESCE(${body.phone   ?? null}, phone),
        company = COALESCE(${body.company ?? null}, company),
        country = COALESCE(${body.country ?? null}, country)
    WHERE id = ${user.sub}
  `

  // Return the updated profile
  const rows = await sql`SELECT * FROM users WHERE id = ${user.sub}`
  const r    = rows[0] as Record<string, unknown>
  const { firstName: fn, lastName: ln } = splitName(r.name as string)

  return NextResponse.json({
    id:          String(r.id),
    email:       r.email         as string,
    firstName:   fn,
    lastName:    ln,
    phone:       (r.phone        as string) ?? '',
    company:     (r.company      as string) ?? '',
    country:     (r.country      as string) ?? '',
    accountName: (r.account_name as string) ?? '',
    isAdmin:     Boolean(r.is_admin),
  })
}
