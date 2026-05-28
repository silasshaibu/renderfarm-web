import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema } from '@/lib/credits'

// GET /api/admin/audit-log?page=1&pageSize=50&action=&adminId=
export async function GET(req: NextRequest) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const page     = Math.max(1, Number(req.nextUrl.searchParams.get('page')     ?? '1'))
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') ?? '50')))
  const offset   = (page - 1) * pageSize
  const actionFilter  = req.nextUrl.searchParams.get('action')  ?? ''
  const adminIdFilter = req.nextUrl.searchParams.get('adminId') ?? ''

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        a.id, a.action, a.details, a.ip_address, a.created_at,
        adm.email AS admin_email,
        tgt.email AS target_email
      FROM audit_log a
      LEFT JOIN users adm ON adm.id = a.admin_id
      LEFT JOIN users tgt ON tgt.id = a.target_user_id
      WHERE (${actionFilter}  = '' OR a.action = ${actionFilter})
        AND (${adminIdFilter} = '' OR a.admin_id::text = ${adminIdFilter})
      ORDER BY a.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    ` as Promise<Record<string, unknown>[]>,
    sql`
      SELECT COUNT(*) AS cnt FROM audit_log
      WHERE (${actionFilter}  = '' OR action = ${actionFilter})
        AND (${adminIdFilter} = '' OR admin_id::text = ${adminIdFilter})
    ` as Promise<Record<string, unknown>[]>,
  ])

  const total = Number(countRows[0]?.cnt ?? 0)
  return NextResponse.json({
    items: rows.map(r => ({
      id:          r.id,
      action:      r.action,
      details:     r.details,
      ip:          r.ip_address,
      createdAt:   r.created_at,
      adminEmail:  r.admin_email ?? '',
      targetEmail: r.target_email ?? '',
    })),
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
  })
}
