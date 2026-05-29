import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest, cmsAudit } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const rows = await sql`SELECT key, value, description, last_changed_at FROM feature_flags ORDER BY key` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    key:           r.key,
    value:         Boolean(r.value),
    description:   r.description ?? '',
    lastChangedAt: r.last_changed_at,
  })))
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { key, value } = await req.json() as { key: string; value: boolean }
  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  await sql`
    UPDATE feature_flags
    SET value = ${value}, last_changed_by = ${admin.id}, last_changed_at = NOW()
    WHERE key = ${key}
  `
  await cmsAudit({
    actorId: admin.id, actorEmail: admin.email,
    action: 'feature_flag_changed',
    targetType: 'feature_flag', targetId: key,
    details: { value },
    ip,
    severity: key === 'maintenance_mode' ? 'critical' : 'warning',
  })

  return NextResponse.json({ ok: true })
}
