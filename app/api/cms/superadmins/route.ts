import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest, cmsAudit } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { generateSecret, generateBackupCodes } from '@/lib/totp'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const rows = await sql`
    SELECT id, email, is_active, last_login_at, last_login_ip, created_at,
           (totp_secret IS NOT NULL) AS has_totp
    FROM superadmins ORDER BY created_at
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:          String(r.id),
    email:       r.email,
    isActive:    Boolean(r.is_active),
    hasTotp:     Boolean(r.has_totp),
    lastLoginAt: r.last_login_at ?? null,
    lastLoginIp: r.last_login_ip ?? '',
    createdAt:   r.created_at,
  })))
}

export async function POST(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { email, password } = await req.json() as { email: string; password: string }
  if (!email || !password || password.length < 12) {
    return NextResponse.json({ message: 'Email and password (min 12 chars) required' }, { status: 400 })
  }

  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  const hash = await bcrypt.hash(password, 12)
  const result = await sql`
    INSERT INTO superadmins (email, password_hash)
    VALUES (${email.toLowerCase()}, ${hash})
    RETURNING id
  ` as Record<string, unknown>[]

  await cmsAudit({
    actorId: admin.id, actorEmail: admin.email,
    action: 'superadmin_created',
    targetType: 'superadmin', targetId: String((result[0] as Record<string, unknown>)?.id ?? ''),
    ip, severity: 'critical',
  })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id, action, value } = await req.json() as { id: string; action: string; value?: unknown }
  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  if (action === 'deactivate') {
    if (String(id) === String(admin.id)) {
      return NextResponse.json({ message: 'Cannot deactivate yourself' }, { status: 400 })
    }
    await sql`UPDATE superadmins SET is_active = FALSE WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'superadmin_deactivated', targetType: 'superadmin', targetId: id, ip, severity: 'critical' })
  } else if (action === 'reset_totp') {
    const secret  = generateSecret()
    const codes   = generateBackupCodes()
    await sql`UPDATE superadmins SET totp_secret = ${secret}, backup_codes = ${JSON.stringify(codes)} WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'superadmin_totp_reset', targetType: 'superadmin', targetId: id, ip, severity: 'critical' })
    return NextResponse.json({ ok: true, totpSecret: secret, backupCodes: codes })
  } else if (action === 'change_password') {
    const pwd = String(value ?? '')
    if (pwd.length < 12) return NextResponse.json({ message: 'Password must be at least 12 characters' }, { status: 400 })
    const hash = await bcrypt.hash(pwd, 12)
    await sql`UPDATE superadmins SET password_hash = ${hash} WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'superadmin_password_changed', targetType: 'superadmin', targetId: id, ip, severity: 'critical' })
  } else {
    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
