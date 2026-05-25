import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



type Context = { params: Promise<{ id: string }> }

// ── GET /api/projects/[id] ────────────────────────────────────────────────────
export async function GET(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { id } = await context.params
  const rows = await sql`SELECT * FROM projects WHERE id = ${id}`
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const r = rows[0] as Record<string, unknown>
  return NextResponse.json({ id: String(r.id), name: r.name as string, isActive: Boolean(r.is_active) })
}

// ── PATCH /api/projects/[id] ──────────────────────────────────────────────────
// Update project name or isActive status.
export async function PATCH(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { id }  = await context.params
  const body     = await req.json() as { name?: string; isActive?: boolean }

  const rows = await sql`
    UPDATE projects
    SET name      = COALESCE(${body.name     ?? null}, name),
        is_active = COALESCE(${body.isActive ?? null}, is_active)
    WHERE id = ${id}
    RETURNING *
  `
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const r = rows[0] as Record<string, unknown>
  return NextResponse.json({ id: String(r.id), name: r.name as string, isActive: Boolean(r.is_active) })
}

// ── DELETE /api/projects/[id] ─────────────────────────────────────────────────
// Soft-delete: sets is_active = FALSE (preserves job history).
export async function DELETE(req: NextRequest, context: Context) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { id } = await context.params
  await sql`UPDATE projects SET is_active = FALSE WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
