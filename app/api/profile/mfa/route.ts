import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { generateSecret, verifyTotp, otpauthUrl, generateBackupCodes } from '@/lib/totp'
import QRCode from 'qrcode'

async function ensureMfaCols() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret       TEXT    DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled      BOOLEAN DEFAULT FALSE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_backup_codes JSONB   DEFAULT NULL`
}

// GET /api/profile/mfa — return MFA status + setup QR (if not yet enabled)
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureMfaCols()

  const rows = await sql`SELECT totp_enabled, totp_secret FROM users WHERE id = ${user.sub} LIMIT 1` as Record<string, unknown>[]
  const row = rows[0] ?? {}
  const enabled = Boolean(row.totp_enabled)

  if (enabled) {
    return NextResponse.json({ enabled: true })
  }

  // Generate a new pending secret for setup
  const secret = generateSecret()
  const url    = otpauthUrl(secret, user.email)
  const qr     = await QRCode.toDataURL(url)

  // Store the pending secret (not yet enabled)
  await sql`UPDATE users SET totp_secret = ${secret}, totp_enabled = FALSE WHERE id = ${user.sub}`

  return NextResponse.json({ enabled: false, secret, qr })
}

// POST /api/profile/mfa — verify TOTP code and enable MFA
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureMfaCols()

  const body = await req.json() as { code?: string }
  if (!body.code) return NextResponse.json({ message: 'code required' }, { status: 400 })

  const rows = await sql`SELECT totp_secret FROM users WHERE id = ${user.sub} LIMIT 1` as Record<string, unknown>[]
  const secret = rows[0]?.totp_secret as string | null
  if (!secret) return NextResponse.json({ message: 'No pending MFA setup' }, { status: 400 })

  if (!verifyTotp(secret, body.code)) {
    return NextResponse.json({ message: 'Invalid code' }, { status: 400 })
  }

  const backupCodes = generateBackupCodes()
  await sql`
    UPDATE users SET totp_enabled = TRUE, totp_backup_codes = ${JSON.stringify(backupCodes)}::jsonb
    WHERE id = ${user.sub}
  `

  return NextResponse.json({ ok: true, backupCodes })
}

// DELETE /api/profile/mfa — disable MFA
export async function DELETE(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureMfaCols()

  await sql`
    UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, totp_backup_codes = NULL
    WHERE id = ${user.sub}
  `

  return NextResponse.json({ ok: true })
}
