import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



// ── DELETE /api/admin/limits/[id] ─────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()

  await sql`DELETE FROM cost_limits WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}

// ── PATCH /api/admin/limits/[id] ──────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  await initDB()

  const body = await req.json() as Record<string, unknown>

  if (body.limit    !== undefined) await sql`UPDATE cost_limits SET limit_usd  = ${parseFloat(String(body.limit))} WHERE id = ${id}`
  if (body.action   !== undefined) await sql`UPDATE cost_limits SET action     = ${String(body.action)}  WHERE id = ${id}`
  if (body.endDate  !== undefined) await sql`UPDATE cost_limits SET end_date   = ${String(body.endDate)} WHERE id = ${id}`
  if (body.recurring !== undefined) await sql`UPDATE cost_limits SET recurring = ${Boolean(body.recurring)} WHERE id = ${id}`

  return NextResponse.json({ ok: true })
}
