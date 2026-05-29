import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { searchParams } = new URL(req.url)
  const severity = searchParams.get('severity') ?? ''
  const action   = searchParams.get('action') ?? ''
  const limit    = Math.min(Number(searchParams.get('limit') ?? 100), 500)
  const offset   = Number(searchParams.get('offset') ?? 0)

  const rows = await sql`
    SELECT id, actor_id, actor_email, actor_type, action, target_type, target_id,
           details, ip_address, severity, created_at
    FROM cms_audit_log
    WHERE
      (${severity} = '' OR severity = ${severity})
      AND (${action} = '' OR action ILIKE ${'%' + action + '%'})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Record<string, unknown>[]

  const total = await sql`
    SELECT COUNT(*) AS cnt FROM cms_audit_log
    WHERE (${severity} = '' OR severity = ${severity})
      AND (${action} = '' OR action ILIKE ${'%' + action + '%'})
  ` as Record<string, unknown>[]

  return NextResponse.json({
    entries: rows.map(r => ({
      id:          String(r.id),
      actorId:     r.actor_id ? String(r.actor_id) : null,
      actorEmail:  r.actor_email ?? '',
      actorType:   r.actor_type ?? 'superadmin',
      action:      r.action,
      targetType:  r.target_type ?? '',
      targetId:    r.target_id ?? '',
      details:     r.details ?? {},
      ip:          r.ip_address ?? '',
      severity:    r.severity ?? 'info',
      createdAt:   r.created_at,
    })),
    total: Number((total[0] as Record<string, unknown>)?.cnt ?? 0),
  })
}
