/**
 * GET /api/cms/setup
 *
 * One-time bootstrap endpoint. Creates the first super admin account
 * and generates a TOTP secret. Self-seals after first use — will return
 * 403 if any superadmin already exists.
 *
 * Returns the TOTP secret + backup codes + otpauth URI so you can
 * configure your authenticator app immediately.
 *
 * DELETE THIS FILE after you've set up your account.
 */
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { sql, initDB } from '@/lib/db'
import { ensureCmsSchema } from '@/lib/cms-auth'
import { generateSecret, generateBackupCodes, otpauthUrl } from '@/lib/totp'

const EMAIL    = 'silasshaibu30bg@gmail.com'
const PASSWORD = 'Renderfarm@2026!'
const ISSUER   = 'RenderfarmCMS'

export async function GET() {
  await initDB()
  await ensureCmsSchema()

  // Refuse if any superadmin already exists
  const existing = await sql`SELECT id FROM superadmins LIMIT 1` as Record<string, unknown>[]
  if (existing.length > 0) {
    return NextResponse.json({ message: 'Setup already complete. Delete this endpoint.' }, { status: 403 })
  }

  const hash   = await bcrypt.hash(PASSWORD, 12)
  const secret = generateSecret()
  const codes  = generateBackupCodes()

  const result = await sql`
    INSERT INTO superadmins (email, password_hash, totp_secret, backup_codes)
    VALUES (${EMAIL}, ${hash}, ${secret}, ${JSON.stringify(codes)})
    RETURNING id
  ` as Record<string, unknown>[]

  const uri = otpauthUrl(secret, EMAIL, ISSUER)

  return NextResponse.json({
    ok: true,
    message: 'Super admin created. Configure your authenticator app now — this data is only shown once.',
    email:       EMAIL,
    password:    PASSWORD,
    totpSecret:  secret,
    otpauthUri:  uri,
    backupCodes: codes,
    loginUrl:    '/cms/login',
    nextStep:    'Scan the otpauthUri in Google Authenticator or Authy, then go to /cms/login',
  })
}
