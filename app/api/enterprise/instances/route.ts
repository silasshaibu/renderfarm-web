import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// GET /api/enterprise/instances
// Returns all machine types formatted for the Enterprise > Available Instances table.
// ?available=true  → returns only enabled instances (used by Blender submitter).
export async function GET(req: NextRequest) {
  const user      = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const onlyAvail = req.nextUrl.searchParams.get('available') === 'true'
  const isAdmin   = Boolean(user.isAdmin)

  // Admins always see all; non-admins with available=true only see enabled
  const rows = await sql`
    SELECT * FROM machine_types
    ${onlyAvail && !isAdmin ? sql`WHERE enabled = TRUE` : sql``}
    ORDER BY sort_order ASC, id ASC
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:            String(r.id),
    label:         r.label      as string,
    instanceType:  r.gcp_type   as string,
    instance:      r.instance   as string,   // 'GPU' | 'CPU'
    vcpu:          Number(r.vcpu),
    ramGb:         Number(r.ram_gb),
    gpuMemory:     (r.gpu_memory as string) || '',
    enabled:       Boolean(r.enabled),
  })))
}

// PATCH /api/enterprise/instances — bulk-update enabled flags
// Body: { instances: [{id, enabled}] }
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const body = await req.json() as { instances: { id: string; enabled: boolean }[] }
  const list  = Array.isArray(body.instances) ? body.instances : []

  for (const item of list) {
    await sql`UPDATE machine_types SET enabled = ${item.enabled} WHERE id = ${item.id}`
  }

  return NextResponse.json({ ok: true, updated: list.length })
}
