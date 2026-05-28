/**
 * lib/credits.ts — Credit system utilities.
 *
 * Each user starts with 50 free welcome credits.
 * Credits are consumed as jobs render (negative entries).
 * Balance = SUM(amount) for a given user.
 *
 * Account deletion is disabled to prevent users from deleting and
 * recreating accounts to claim the $50 welcome bonus multiple times.
 * Only admins can deactivate accounts via /admin/users.
 */
import { sql } from './db'
import { sendEmail, baseUrl } from './email'

// ---------------------------------------------------------------------------
// Schema setup (lazy — idempotent)
// ---------------------------------------------------------------------------
export async function ensureCreditSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS credits (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL,
      amount      NUMERIC(12,4) NOT NULL,
      type        TEXT NOT NULL CHECK (type IN (
                    'welcome_bonus','purchased','admin_grant','refund','usage'
                  )),
      description TEXT NOT NULL DEFAULT '',
      job_id      INTEGER DEFAULT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      created_by  INTEGER DEFAULT NULL
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS credits_user_idx ON credits (user_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS abuse_signals (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL,
      signal_type     TEXT NOT NULL,
      matched_user_id INTEGER DEFAULT NULL,
      details         TEXT DEFAULT '',
      reviewed        BOOLEAN DEFAULT FALSE,
      action_taken    TEXT DEFAULT 'none',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id             SERIAL PRIMARY KEY,
      admin_id       INTEGER NOT NULL,
      target_user_id INTEGER DEFAULT NULL,
      action         TEXT NOT NULL,
      details        JSONB DEFAULT '{}',
      ip_address     TEXT DEFAULT '',
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // User table additions for credit/suspension system
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status              TEXT    DEFAULT 'active'`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason   TEXT    DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at        TIMESTAMPTZ DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by        INTEGER DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip     TEXT    DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS normalized_email    TEXT    DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS low_balance_notified_at TIMESTAMPTZ DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_bonus_claimed BOOLEAN DEFAULT FALSE`
}

// ---------------------------------------------------------------------------
// Normalize email for abuse detection
// e.g. "s.ilas+test@gmail.com" → "silas@gmail.com"
// ---------------------------------------------------------------------------
export function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim()
  const [local, domain] = lower.split('@')
  if (!local || !domain) return lower
  // Strip +tags and dots for gmail/googlemail
  const gmailDomains = ['gmail.com', 'googlemail.com']
  if (gmailDomains.includes(domain)) {
    const clean = local.split('+')[0].replace(/\./g, '')
    return `${clean}@gmail.com`
  }
  // Strip +tags for other providers
  const clean = local.split('+')[0]
  return `${clean}@${domain}`
}

// ---------------------------------------------------------------------------
// Credit balance
// ---------------------------------------------------------------------------
export async function getBalance(userId: number | string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS balance FROM credits WHERE user_id = ${userId}
  ` as Record<string, unknown>[]
  return Number(rows[0]?.balance ?? 0)
}

// ---------------------------------------------------------------------------
// Add credits (positive amount = grant/bonus, negative = usage/deduction)
// ---------------------------------------------------------------------------
export async function addCredit(opts: {
  userId:      number
  amount:      number
  type:        'welcome_bonus' | 'purchased' | 'admin_grant' | 'refund' | 'usage'
  description: string
  jobId?:      number | null
  createdBy?:  number | null
}): Promise<void> {
  await sql`
    INSERT INTO credits (user_id, amount, type, description, job_id, created_by)
    VALUES (
      ${opts.userId},
      ${opts.amount},
      ${opts.type},
      ${opts.description},
      ${opts.jobId ?? null},
      ${opts.createdBy ?? null}
    )
  `
}

// ---------------------------------------------------------------------------
// Grant welcome bonus — safe to call after user creation
// ---------------------------------------------------------------------------
export async function grantWelcomeBonus(userId: number, email: string, firstName: string): Promise<boolean> {
  await ensureCreditSchema()

  // Idempotency guard — only grant once
  const existing = await sql`
    SELECT id FROM credits WHERE user_id = ${userId} AND type = 'welcome_bonus' LIMIT 1
  `
  if (existing.length > 0) return false

  await addCredit({
    userId,
    amount:      50,
    type:        'welcome_bonus',
    description: 'Welcome bonus — 50 free credits',
  })
  await sql`UPDATE users SET welcome_bonus_claimed = TRUE WHERE id = ${userId}`

  // Welcome email (fire and forget)
  const dashUrl = `${baseUrl()}/`
  sendEmail({
    to:      email,
    subject: 'Welcome to Renderfarm — You have 50 free credits!',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px">
        <h2 style="color:#fff;margin-bottom:8px">Welcome, ${firstName}!</h2>
        <p style="color:#94a3b8">Your Renderfarm account is ready.</p>
        <div style="background:#1e2433;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
          <p style="font-size:32px;font-weight:bold;color:#3b82f6;margin:0">$50.00</p>
          <p style="color:#94a3b8;margin:4px 0 0">Free render credits added to your account</p>
        </div>
        <p style="color:#94a3b8">Credits are used automatically when you submit render jobs. Each credit = $1 of render time.</p>
        <a href="${dashUrl}" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Go to Dashboard</a>
      </div>
    `,
  }).catch(() => null)

  return true
}

// ---------------------------------------------------------------------------
// Abuse detection — run after user creation, before granting bonus
// ---------------------------------------------------------------------------
export async function detectAbuse(opts: {
  userId:     number
  email:      string
  normEmail:  string
  ip:         string
}): Promise<{ flagged: boolean; reason: string }> {
  const { userId, normEmail, ip } = opts

  // Signal 1: normalized email match
  const emailMatch = await sql`
    SELECT id FROM users
    WHERE normalized_email = ${normEmail}
      AND id <> ${userId}
      AND welcome_bonus_claimed = TRUE
    LIMIT 1
  ` as Record<string, unknown>[]

  if (emailMatch.length > 0) {
    const matched = emailMatch[0] as { id: number }
    await sql`
      INSERT INTO abuse_signals (user_id, signal_type, matched_user_id, details)
      VALUES (${userId}, 'email_similarity', ${matched.id},
              ${`Normalized email "${normEmail}" already claimed a welcome bonus`})
    `
    return { flagged: true, reason: 'email_similarity' }
  }

  // Signal 2: IP with 3+ bonus-claiming accounts
  if (ip) {
    const ipCount = await sql`
      SELECT COUNT(*) AS cnt FROM users
      WHERE registration_ip = ${ip}
        AND welcome_bonus_claimed = TRUE
        AND id <> ${userId}
    ` as Record<string, unknown>[]
    const cnt = Number(ipCount[0]?.cnt ?? 0)
    if (cnt >= 3) {
      await sql`
        INSERT INTO abuse_signals (user_id, signal_type, details)
        VALUES (${userId}, 'ip_match',
                ${`IP "${ip}" has ${cnt} accounts that already claimed welcome bonus`})
      `
      return { flagged: true, reason: 'ip_match' }
    }
  }

  return { flagged: false, reason: '' }
}

// ---------------------------------------------------------------------------
// Low balance notification (once per dip below threshold)
// ---------------------------------------------------------------------------
export async function maybeSendLowBalanceEmail(userId: number, email: string, balance: number): Promise<void> {
  if (balance >= 10) {
    // Reset notification gate when balance recovers
    await sql`UPDATE users SET low_balance_notified_at = NULL WHERE id = ${userId} AND low_balance_notified_at IS NOT NULL`
    return
  }

  const rows = await sql`SELECT low_balance_notified_at FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
  const lastNotified = rows[0]?.low_balance_notified_at as string | null
  if (lastNotified) return // Already notified this dip

  await sql`UPDATE users SET low_balance_notified_at = NOW() WHERE id = ${userId}`

  const subject = balance <= 0
    ? 'Your Renderfarm credits have been used up'
    : 'Your Renderfarm render credits are running low'

  const body = balance <= 0
    ? `You have no credits remaining. New jobs cannot be submitted until you add credits.`
    : `You have $${balance.toFixed(2)} remaining. Add more credits to keep rendering without interruption.`

  sendEmail({
    to: email,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px">
        <h2 style="color:#fff">${subject}</h2>
        <p style="color:#94a3b8">${body}</p>
        <a href="${baseUrl()}/profile" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">View Account</a>
      </div>
    `,
  }).catch(() => null)
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export async function logAudit(opts: {
  adminId:      number
  targetUserId?: number | null
  action:       string
  details?:     Record<string, unknown>
  ip?:          string
}): Promise<void> {
  await sql`
    INSERT INTO audit_log (admin_id, target_user_id, action, details, ip_address)
    VALUES (
      ${opts.adminId},
      ${opts.targetUserId ?? null},
      ${opts.action},
      ${JSON.stringify(opts.details ?? {})}::jsonb,
      ${opts.ip ?? ''}
    )
  `
}
