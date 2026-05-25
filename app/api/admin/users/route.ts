import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



function rowToUser(r: Record<string, unknown>) {
  return {
    id:       String(r.id),
    email:    r.email      as string,
    name:     (r.name      as string | undefined) ?? (r.email as string).split('@')[0],
    isAdmin:  Boolean(r.is_admin),
    isActive: r.is_active != null ? Boolean(r.is_active) : true,
  }
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// Returns all users. Admin-only.
// Query params: filter=<email substring>, status=active|inactive
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  // Ensure is_active column exists (was added by register route ALTER TABLE)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT ''`

  const filter = req.nextUrl.searchParams.get('filter')   ?? ''
  const status = req.nextUrl.searchParams.get('status')   ?? ''  // 'active' | 'inactive' | ''

  let rows: Record<string, unknown>[]

  if (filter && status === 'active') {
    rows = await sql`
      SELECT * FROM users
      WHERE email ILIKE ${'%' + filter + '%'} AND (is_active = TRUE OR is_active IS NULL)
      ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (filter && status === 'inactive') {
    rows = await sql`
      SELECT * FROM users
      WHERE email ILIKE ${'%' + filter + '%'} AND is_active = FALSE
      ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (filter) {
    rows = await sql`
      SELECT * FROM users WHERE email ILIKE ${'%' + filter + '%'} ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (status === 'active') {
    rows = await sql`
      SELECT * FROM users WHERE is_active = TRUE OR is_active IS NULL ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (status === 'inactive') {
    rows = await sql`
      SELECT * FROM users WHERE is_active = FALSE ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else {
    rows = await sql`SELECT * FROM users ORDER BY id ASC` as Record<string, unknown>[]
  }

  return NextResponse.json(rows.map(rowToUser))
}
