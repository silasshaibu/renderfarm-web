import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import {
  ensureCmsSchema,
  checkLoginRateLimit,
  recordLoginAttempt,
  checkIpWhitelist,
  cmsAudit,
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
    const { email, password } = await req.json() as { email?: string; password?: string }
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
    const valid = await bcrypt.compare(password, String(sa.password_hash))
    if (!valid) {
      await recordLoginAttempt(ip, email, false)
      await cmsAudit({ actorEmail: email, action: 'login_failed', ip, severity: 'warning' })
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    if (!sa.is_active) {
      return NextResponse.json({ message: 'Account disabled' }, { status: 403 })
    }

    const hasTOTP = Boolean(sa.totp_secret)

    return NextResponse.json({
      ok: true,
      requiresTOTP: hasTOTP,
      // If no TOTP yet — return a pending token so /verify-totp can continue
      pendingEmail: hasTOTP ? email : undefined,
      needsTOTPSetup: !hasTOTP,
      // If no TOTP configured, directly issue session (first-time setup flow)
      email: email.toLowerCase(),
    })
  } catch (err) {
    console.error('CMS login error:', err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
