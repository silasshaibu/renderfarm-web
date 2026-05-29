/**
 * One-time script to create the first super admin account.
 *
 * Usage:
 *   node scripts/create-superadmin.js
 *
 * Set DATABASE_URL in your environment (or .env.local) before running.
 *
 * After creating the account, run:
 *   node scripts/setup-superadmin-totp.js <email>
 * to generate the TOTP secret and configure your authenticator app.
 */
const readline = require('readline')
const bcrypt   = require('bcryptjs')
const { neon } = require('@neondatabase/serverless')

require('dotenv').config({ path: '.env.local' })

const sql = neon(process.env.DATABASE_URL)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(r => rl.question(q, r))

async function main() {
  console.log('\n=== Renderfarm CMS — Create Super Admin ===\n')

  const email = await ask('Email: ')
  const password = await ask('Password (min 12 chars): ')

  if (!email || !password || password.length < 12) {
    console.error('Invalid email or password too short.')
    process.exit(1)
  }

  // Ensure schema
  await sql`
    CREATE TABLE IF NOT EXISTS superadmins (
      id              SERIAL PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      totp_secret     TEXT DEFAULT NULL,
      backup_codes    JSONB DEFAULT '[]',
      last_login_at   TIMESTAMPTZ DEFAULT NULL,
      last_login_ip   TEXT DEFAULT '',
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `

  const hash = await bcrypt.hash(password, 12)
  const result = await sql`
    INSERT INTO superadmins (email, password_hash)
    VALUES (${email.toLowerCase()}, ${hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}
    RETURNING id
  `

  console.log(`\nSuper admin created (id=${result[0].id}).`)
  console.log('\nNext: Set up TOTP by running:')
  console.log(`  node scripts/setup-totp.js ${email.toLowerCase()}`)
  console.log('\nOr set up TOTP from within the CMS at /cms/profile once another super admin logs in.\n')

  rl.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
