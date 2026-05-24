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

type Context = { params: Promise<{ id: string }> }

// ── GET /api/projects/[id] ────────────────────────────────────────────────────
export async function GET(req: NextRequest, context: Context) {
  const user = verifyToken(req)
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
  const user = verifyToken(req)
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
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { id } = await context.params
  await sql`UPDATE projects SET is_active = FALSE WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
