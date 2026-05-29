import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { verifyTotp } from '@/lib/totp'
import {
  ensureCmsSchema,
  checkLoginRateLimit,
  recordLoginAttempt,
  createCmsSession,
  checkIpWhitelist,
  cmsAudit,
  CMS_COOKIE,
  SESSION_TTL,
} from '@/lib/cms-auth'

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  )
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, totpCode, backupCode } = await req.json() as {
      email?: string
      password?: string
      totpCode?: string
      backupCode?: string
    }

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password required' }, { status: 400 })
    }

    const ip = getIP(req)

    if (!checkIpWhitelist(ip)) {
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    await initDB()
    await ensureCmsSchema()

    const rl = await checkLoginRateLimit(ip)
    if (!rl.allowed) {
      return NextResponse.json(
        { message: 'Too many failed attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    // Re-verify credentials (don't trust client state)
    const rows = await sql`
      SELECT id, email, password_hash, totp_secret, backup_codes, is_active
      FROM superadmins
      WHERE email = ${email.toLowerCase()}
      LIMIT 1
    ` as Record<string, unknown>[]

    if (!rows.length) {
      await recordLoginAttempt(ip, email, false)
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const sa = rows[0]
    const validPwd = await bcrypt.compare(password, String(sa.password_hash))
    if (!validPwd || !sa.is_active) {
      await recordLoginAttempt(ip, email, false)
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const secret = sa.totp_secret as string | null

    // If no TOTP yet — cannot authenticate without it
    if (!secret) {
      return NextResponse.json(
        { message: 'TOTP not configured. Contact system administrator.' },
        { status: 403 }
      )
    }

    // Verify TOTP code or backup code
    let authed = false
    if (totpCode) {
      authed = verifyTotp(secret, totpCode)
    } else if (backupCode) {
      const codes = (sa.backup_codes as string[]) ?? []
      const idx   = codes.findIndex(c => c === backupCode.toUpperCase().trim())
      if (idx !== -1) {
        authed = true
        // Consume the backup code
        codes.splice(idx, 1)
        await sql`UPDATE superadmins SET backup_codes = ${JSON.stringify(codes)} WHERE id = ${sa.id}`
      }
    }

    if (!authed) {
      await recordLoginAttempt(ip, email, false)
      await cmsAudit({
        actorId: Number(sa.id), actorEmail: String(sa.email),
        action: 'totp_failed', ip, severity: 'warning',
      })
      return NextResponse.json({ message: 'Invalid authentication code' }, { status: 401 })
    }

    // Success — create session
    const ua    = req.headers.get('user-agent') ?? ''
    const token = await createCmsSession(Number(sa.id), ip, ua)

    await recordLoginAttempt(ip, email, true)
    await sql`UPDATE superadmins SET last_login_at = NOW(), last_login_ip = ${ip} WHERE id = ${sa.id}`
    await cmsAudit({
      actorId: Number(sa.id), actorEmail: String(sa.email),
      action: 'login_success', ip, severity: 'info',
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set(CMS_COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   SESSION_TTL / 1000,
      path:     '/',
    })
    return res
  } catch (err) {
    console.error('CMS verify-totp error:', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
