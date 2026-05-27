import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/enterprise/shotgrid/[id]
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  await initDB()
  const b = await req.json() as {
    conductorProject?: string; shotgridProjectId?: string; shotgridHost?: string
    scriptName?: string; apiKey?: string
  }
  const rows = await sql`
    UPDATE enterprise_shotgrid SET
      conductor_project   = COALESCE(${b.conductorProject   ?? null}, conductor_project),
      shotgrid_project_id = COALESCE(${b.shotgridProjectId  ?? null}, shotgrid_project_id),
      shotgrid_host       = COALESCE(${b.shotgridHost       ?? null}, shotgrid_host),
      script_name         = COALESCE(${b.scriptName         ?? null}, script_name),
      api_key             = COALESCE(${b.apiKey             ?? null}, api_key)
    WHERE id = ${id}
    RETURNING id
  `
  if (!rows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/enterprise/shotgrid/[id]
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  await initDB()
  await sql`DELETE FROM enterprise_shotgrid WHERE id = ${id}`
  return NextResponse.json({ ok: true })
}
