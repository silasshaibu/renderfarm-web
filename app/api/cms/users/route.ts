import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest, cmsAudit } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { searchParams } = new URL(req.url)
  const search  = searchParams.get('q') ?? ''
  const status  = searchParams.get('status') ?? ''
  const limit   = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset  = Number(searchParams.get('offset') ?? 0)

  const rows = await sql`
    SELECT
      u.id, u.email, u.name, u.is_admin, u.is_active, u.status,
      u.suspension_reason, u.created_at, u.last_login_at, u.invited,
      u.totp_enabled, u.credit_limit,
      COALESCE((SELECT SUM(amount) FROM credits WHERE user_id = u.id), 0) AS balance
    FROM users u
    WHERE
      (${search} = '' OR u.email ILIKE ${'%' + search + '%'} OR u.name ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR u.status = ${status})
    ORDER BY u.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Record<string, unknown>[]

  const total = await sql`
    SELECT COUNT(*) AS cnt FROM users
    WHERE
      (${search} = '' OR email ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR status = ${status})
  ` as Record<string, unknown>[]

  return NextResponse.json({
    users: rows.map(r => ({
      id:               String(r.id),
      email:            r.email,
      name:             r.name ?? '',
      isAdmin:          Boolean(r.is_admin),
      isActive:         Boolean(r.is_active),
      status:           r.status ?? 'active',
      suspensionReason: r.suspension_reason ?? '',
      createdAt:        r.created_at,
      lastLoginAt:      r.last_login_at ?? null,
      invited:          Boolean(r.invited),
      totpEnabled:      Boolean(r.totp_enabled),
      creditLimit:      Number(r.credit_limit ?? 0),
      balance:          Number(r.balance ?? 0),
    })),
    total: Number((total[0] as Record<string, unknown>)?.cnt ?? 0),
  })
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id, action, value } = await req.json() as {
    id: string; action: string; value?: unknown
  }

  await initDB()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  if (action === 'suspend') {
    await sql`UPDATE users SET status = 'suspended', suspension_reason = ${String(value ?? '')} WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_suspended', targetType: 'user', targetId: id, ip, severity: 'warning' })
  } else if (action === 'unsuspend') {
    await sql`UPDATE users SET status = 'active', suspension_reason = '' WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_unsuspended', targetType: 'user', targetId: id, ip, severity: 'info' })
  } else if (action === 'make_admin') {
    await sql`UPDATE users SET is_admin = TRUE WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_promoted_admin', targetType: 'user', targetId: id, ip, severity: 'critical' })
  } else if (action === 'remove_admin') {
    await sql`UPDATE users SET is_admin = FALSE WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_demoted_admin', targetType: 'user', targetId: id, ip, severity: 'warning' })
  } else if (action === 'reset_2fa') {
    await sql`UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_backup_codes = '[]' WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_2fa_reset', targetType: 'user', targetId: id, ip, severity: 'warning' })
  } else if (action === 'delete') {
    await sql`DELETE FROM users WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'user_deleted', targetType: 'user', targetId: id, ip, severity: 'critical' })
  } else if (action === 'set_credit_limit') {
    await sql`UPDATE users SET credit_limit = ${Number(value)} WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'credit_limit_set', targetType: 'user', targetId: id, details: { limit: value }, ip, severity: 'info' })
  } else if (action === 'grant_credits') {
    const { amount, note } = value as { amount: number; note: string }
    await sql`INSERT INTO credits (user_id, amount, description, granted_by) VALUES (${id}, ${amount}, ${note ?? 'CMS credit grant'}, ${'superadmin:' + admin.email})`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'credits_granted', targetType: 'user', targetId: id, details: { amount, note }, ip, severity: 'info' })
  } else {
    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
