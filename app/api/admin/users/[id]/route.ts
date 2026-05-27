import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// ── DELETE /api/admin/users/[id] ──────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await verifyToken(req)
  if (!caller || !caller.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  if (String(caller.sub) === id) {
    return NextResponse.json({ message: 'Cannot delete your own account' }, { status: 400 })
  }

  await initDB()

  // Revoke all active sessions for this user
  await sql`UPDATE user_sessions SET revoked = TRUE WHERE user_id = ${id}`.catch(() => null)

  const rows = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

// ── PATCH /api/admin/users/[id] ───────────────────────────────────────────────
// Update a user's isActive or isAdmin flag. Admin-only.
// Body: { isActive?: boolean, isAdmin?: boolean }
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req)
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
