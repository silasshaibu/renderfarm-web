/**
 * Generate and store a TOTP secret for a super admin.
 * Outputs the otpauth:// URI and backup codes so you can scan with Google Authenticator / Authy.
 *
 * Usage: node scripts/setup-totp.js <email>
 */
const crypto   = require('crypto')
const { neon } = require('@neondatabase/serverless')

require('dotenv').config({ path: '.env.local' })

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function b32Encode(buf) {
  let bits = 0, val = 0, out = ''
  for (const byte of buf) {
    val = (val << 8) | byte; bits += 8
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31]
  return out
}

function generateSecret() { return b32Encode(crypto.randomBytes(20)) }
function generateBackupCodes(count = 8) {
  return Array.from({ length: count }, () =>
    [crypto.randomBytes(4).toString('hex').toUpperCase(), crypto.randomBytes(4).toString('hex').toUpperCase()].join('-')
  )
}

const sql = neon(process.env.DATABASE_URL)

async function main() {
  const email = process.argv[2]
  if (!email) { console.error('Usage: node scripts/setup-totp.js <email>'); process.exit(1) }

  const secret = generateSecret()
  const codes  = generateBackupCodes()

  await sql`
    UPDATE superadmins
    SET totp_secret = ${secret}, backup_codes = ${JSON.stringify(codes)}
    WHERE email = ${email.toLowerCase()}
  `

  const issuer = 'RenderfarmCMS'
  const uri    = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`

  console.log('\n=== TOTP Setup ===\n')
  console.log('Email:', email)
  console.log('Secret:', secret)
  console.log('\notpauth URI (scan or paste into authenticator):')
  console.log(uri)
  console.log('\nBackup Codes (save these securely):')
  codes.forEach(c => console.log(' ', c))
  console.log('\nTOTP configured. Log in at /cms/login\n')
}

main().catch(err => { console.error(err); process.exit(1) })
