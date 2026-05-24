import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns the authenticated user's profile from the DB.
export async function GET(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  let payload: { sub: string; email: string; isAdmin: boolean }
  try {
    payload = jwt.verify(token, JWT_SECRET) as typeof payload
  } catch {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  // Ensure optional profile columns exist (same guard as /api/profile)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name    TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone   TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT DEFAULT ''`

  const rows = await sql`
    SELECT id, email, is_admin, name, phone, company, country
    FROM   users
    WHERE  id = ${parseInt(payload.sub, 10)}
    LIMIT  1
  ` as Record<string, unknown>[]

  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  const u = rows[0]
  const name = (u.name as string | null) ?? ''
  const parts = name.trim().split(' ')
  const firstName = parts[0] ?? ''
  const lastName  = parts.slice(1).join(' ')

  return NextResponse.json({
    id:        String(u.id),
    email:     u.email,
    name,
    firstName,
    lastName,
    phone:     u.phone   ?? '',
    company:   u.company ?? '',
    country:   u.country ?? '',
    isAdmin:   Boolean(u.is_admin),
  })
}
