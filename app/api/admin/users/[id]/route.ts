import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean } }
  catch { return null }
}

// ── PATCH /api/admin/users/[id] ───────────────────────────────────────────────
// Update a user's isActive or isAdmin flag. Admin-only.
// Body: { isActive?: boolean, isAdmin?: boolean }
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`

  const { id } = await context.params
  const body   = await req.json() as { isActive?: boolean; isAdmin?: boolean }

  // Prevent admin from removing their own admin flag
  if (body.isAdmin === false && String(user.sub) === id) {
    return NextResponse.json({ message: 'Cannot remove your own admin role' }, { status: 400 })
  }

  const rows = await sql`
    UPDATE users
    SET is_active = COALESCE(${body.isActive ?? null}, is_active),
        is_admin  = COALESCE(${body.isAdmin  ?? null}, is_admin)
    WHERE id = ${id}
    RETURNING id, email, is_admin, is_active
  `

  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  const r = rows[0] as Record<string, unknown>
  return NextResponse.json({
    id:       String(r.id),
    email:    r.email    as string,
    isAdmin:  Boolean(r.is_admin),
    isActive: r.is_active != null ? Boolean(r.is_active) : true,
  })
}
