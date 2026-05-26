import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/machine-types
// Public (no auth) — returns all enabled machine types ordered by sort_order.
// The Blender addon calls this on load to populate its dropdown.
// Pass ?all=1 (admin only) to return every row including disabled ones.
export async function GET(req: NextRequest) {
  await initDB()

  const showAll = req.nextUrl.searchParams.get('all') === '1'

  if (showAll) {
    const user = await verifyToken(req)
    if (!user?.isAdmin) {
      return NextResponse.json({ message: 'Admin only' }, { status: 403 })
    }
    const rows = await sql`
      SELECT id, label, instance, gcp_type, gpu_memory, vcpu, ram_gb, enabled, sort_order
      FROM machine_types
      ORDER BY sort_order ASC
    `
    return NextResponse.json(rows)
  }

  const rows = await sql`
    SELECT id, label, instance, gcp_type, gpu_memory, vcpu, ram_gb
    FROM machine_types
    WHERE enabled = TRUE
    ORDER BY sort_order ASC
  `
  return NextResponse.json(rows)
}

// PATCH /api/machine-types/:id — admin toggles enabled / updates sort_order
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isAdmin) {
    return NextResponse.json({ message: 'Admin only' }, { status: 403 })
  }

  await initDB()

  const body = await req.json() as {
    id:          string
    enabled?:    boolean
    sort_order?: number
  }

  if (!body.id) {
    return NextResponse.json({ message: 'id is required' }, { status: 400 })
  }

  const rows = await sql`
    UPDATE machine_types
    SET
      enabled    = COALESCE(${body.enabled    ?? null}, enabled),
      sort_order = COALESCE(${body.sort_order ?? null}, sort_order)
    WHERE id = ${body.id}
    RETURNING *
  `

  if (!rows.length) {
    return NextResponse.json({ message: 'Machine type not found' }, { status: 404 })
  }

  return NextResponse.json(rows[0])
}
