import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/announcements/active — active, in-window announcements for this user.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json([])

  await initDB()
  const rows = await sql`
    SELECT id, title, message, type, audience, dismissible, created_at
    FROM announcements
    WHERE is_active = TRUE
      AND (show_from IS NULL OR show_from <= NOW())
      AND (show_until IS NULL OR show_until > NOW())
    ORDER BY created_at DESC
    LIMIT 20
  `.catch(() => []) as Record<string, unknown>[]

  // Audience filter: 'all' for everyone, 'admins' only for admins
  const isAdmin = Boolean(user.isAdmin)
  const visible = rows.filter(r => (r.audience ?? 'all') === 'all' || (r.audience === 'admins' && isAdmin))

  return NextResponse.json(visible.map(r => ({
    id:          String(r.id),
    title:       r.title,
    message:     r.message,
    type:        r.type ?? 'info',
    dismissible: Boolean(r.dismissible),
  })))
}
