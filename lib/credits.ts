/**
 * lib/credits.ts — Credit system utilities.
 *
 * Each user starts with 25 free welcome credits.
 * Credits are consumed as jobs render (negative entries).
 * Balance = SUM(amount) for a given user.
 *
 * Storage billing: $0.10/GB/month, billed daily.
 * Auto-purge: 20 days of inactivity (resets on each visit).
 * Overdraft limit: -$5.00 (not -$20).
 *
 * Account deletion is disabled to prevent users from deleting and
 * recreating accounts to claim the $25 welcome bonus multiple times.
 * Only admins can deactivate accounts via /admin/users.
 */
import { sql } from './db'
import { sendEmail, baseUrl } from './email'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const STORAGE_PRICE_PER_GB_MONTH = 0.10
export const STORAGE_PURGE_DAYS = 20  // if user hasn't visited in 20 days
export const STORAGE_WARN_DAYS_BEFORE = 7  // notify 7 days before purge
export const OVERDRAFT_LIMIT_DEFAULT = -5.00  // changed from -20 to -5

// ---------------------------------------------------------------------------
// Schema setup (lazy — idempotent)
// ---------------------------------------------------------------------------
export async function ensureCreditSchema() {
  // Storage billing table
  await sql`
    CREATE TABLE IF NOT EXISTS storage_billing (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_path        TEXT NOT NULL,
      file_name        TEXT NOT NULL,
      md5_hash         TEXT NOT NULL,
      file_size_bytes  BIGINT DEFAULT 0,
      file_type        VARCHAR CHECK (file_type IN ('asset','output')),
      job_id           INTEGER REFERENCES jobs(id),
      uploaded_at      TIMESTAMPTZ DEFAULT NOW(),
      purged_at        TIMESTAMPTZ NULL,
      last_billed_at   TIMESTAMPTZ,
      total_billed     DECIMAL(12,4) DEFAULT 0.00,
      is_active        BOOLEAN DEFAULT true
    )
  `.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS idx_storage_user_active ON storage_billing(user_id, is_active)`.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS idx_storage_md5 ON storage_billing(md5_hash)`.catch(() => null)

  // IP blocklist table
  await sql`
    CREATE TABLE IF NOT EXISTS ip_blocklist (
      id               SERIAL PRIMARY KEY,
      ip_address       VARCHAR NOT NULL UNIQUE,
      reason           VARCHAR,
      blocked_at       TIMESTAMPTZ DEFAULT NOW(),
      blocked_by       VARCHAR DEFAULT 'system',
      expires_at       TIMESTAMPTZ NULL,
      reviewed         BOOLEAN DEFAULT false,
      notes            TEXT
    )
  `.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS idx_ip_blocklist ON ip_blocklist(ip_address)`.catch(() => null)

  // Blocked attempts log
  await sql`
    CREATE TABLE IF NOT EXISTS blocked_attempts (
      id               SERIAL PRIMARY KEY,
      ip_address       VARCHAR,
      attempted_at     TIMESTAMPTZ DEFAULT NOW(),
      endpoint         VARCHAR,
      user_agent       VARCHAR
    )
  `.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS idx_blocked_ip ON blocked_attempts(ip_address)`.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS idx_blocked_time ON blocked_attempts(attempted_at)`.catch(() => null)

  // Abuse scores
  await sql`
    CREATE TABLE IF NOT EXISTS user_abuse_scores (
      user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      score            INTEGER DEFAULT 0,
      last_updated     TIMESTAMPTZ DEFAULT NOW(),
      auto_suspended   BOOLEAN DEFAULT false
    )
  `.catch(() => null)

  // Credits table
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
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_limit        NUMERIC(12,4) DEFAULT 0`
  // Overdraft system (limit is now -$5, not -$20)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS overdraft_limit     NUMERIC(12,4) DEFAULT -5.00`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS overdraft_notified  BOOLEAN DEFAULT FALSE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS debt_hold_since     TIMESTAMPTZ DEFAULT NULL`
  // Storage & uploads
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visited_at     TIMESTAMPTZ DEFAULT NULL`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS uploads_blocked     BOOLEAN DEFAULT FALSE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_limit_multiplier DECIMAL DEFAULT 1.0`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_auto_purge_days INTEGER DEFAULT 20`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_cost_alert  DECIMAL DEFAULT 5.00`
  // Jobs
  await sql`ALTER TABLE jobs  ADD COLUMN IF NOT EXISTS held_for_debt       BOOLEAN DEFAULT FALSE`.catch(() => null)
  // Abuse signals enhancements
  await sql`ALTER TABLE abuse_signals ADD COLUMN IF NOT EXISTS severity    VARCHAR DEFAULT 'medium'`.catch(() => null)
  await sql`ALTER TABLE abuse_signals ADD COLUMN IF NOT EXISTS auto_actioned BOOLEAN DEFAULT false`.catch(() => null)
  await sql`ALTER TABLE abuse_signals ADD COLUMN IF NOT EXISTS ip_address  VARCHAR`.catch(() => null)
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
    amount:      25,
    type:        'welcome_bonus',
    description: 'Welcome bonus — 25 free credits',
  })
  await sql`UPDATE users SET welcome_bonus_claimed = TRUE WHERE id = ${userId}`

  // Welcome email (fire and forget)
  const dashUrl = `${baseUrl()}/`
  sendEmail({
    to:      email,
    subject: 'Welcome to Renderfarm — You have 25 free credits!',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px">
        <h2 style="color:#fff;margin-bottom:8px">Welcome, ${firstName}!</h2>
        <p style="color:#94a3b8">Your Renderfarm account is ready.</p>
        <div style="background:#1e2433;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
          <p style="font-size:32px;font-weight:bold;color:#3b82f6;margin:0">$25.00</p>
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
// Overdraft system
// ---------------------------------------------------------------------------
// (OVERDRAFT_LIMIT_DEFAULT already defined at top as -5.00)

/** Check balance after a deduction and take action if overdraft is exceeded. */
export async function checkOverdraftStatus(userId: number, balance: number): Promise<void> {
  try {
    const userRows = await sql`
      SELECT email, name, overdraft_limit, overdraft_notified, debt_hold_since
      FROM users WHERE id = ${userId} LIMIT 1
    ` as Record<string, unknown>[]
    if (!userRows.length) return

    const user            = userRows[0]
    const overdraftLimit  = Number(user.overdraft_limit ?? OVERDRAFT_LIMIT_DEFAULT)
    const alreadyInHold   = Boolean(user.debt_hold_since)

    // Zone 1: Healthy — clear any previous hold
    if (balance >= 0 && alreadyInHold) {
      await clearDebtHold(userId, String(user.email))
      return
    }

    // Zone 2: Overdraft but within limit (-$0.01 → -$20) — jobs keep running
    if (balance > overdraftLimit && balance < 0) {
      await maybeSendLowBalanceEmail(userId, String(user.email), balance)
      return
    }

    // Zone 3: Limit exceeded (< -$20) — kill jobs, hold new ones
    if (balance <= overdraftLimit && !alreadyInHold) {
      await handleOverdraftExceeded(userId, balance, overdraftLimit, String(user.email))
    }
  } catch (err) {
    console.error('[credits] checkOverdraftStatus error:', err)
  }
}

/** Kill running jobs, hold pending ones, notify user + admin. */
export async function handleOverdraftExceeded(
  userId: number, balance: number, overdraftLimit: number, email: string
): Promise<void> {
  // Mark user as in debt hold (prevents duplicate triggers)
  await sql`
    UPDATE users
    SET debt_hold_since = NOW(), overdraft_notified = TRUE
    WHERE id = ${userId}
  `

  // Kill all running jobs for this user
  const killedJobs = await sql`
    UPDATE jobs SET status = 'failed',
      status_description = 'Overdraft limit exceeded — balance below $${Math.abs(overdraftLimit).toFixed(2)}'
    WHERE user_id = ${userId} AND status IN ('running','syncing','pending')
    RETURNING id, job_number, title
  ` as Record<string, unknown>[]

  // Fail all running/pending tasks for those jobs
  if (killedJobs.length > 0) {
    const jobIds = killedJobs.map(j => Number(j.id))
    await sql`
      UPDATE tasks SET status = 'failed'
      WHERE job_id = ANY(${jobIds}::int[]) AND status IN ('running','pending','queued')
    `.catch(() => null)
  }

  // Hold any queued/held-scout jobs under this user
  await sql`
    UPDATE jobs SET status = 'holding', held_for_debt = TRUE
    WHERE user_id = ${userId} AND status IN ('queued','holding','upload_pending')
    AND (held_for_debt IS NULL OR held_for_debt = FALSE)
  `.catch(() => null)

  // Email user
  const dashUrl = baseUrl()
  sendEmail({
    to: email,
    subject: '⚠ Renderfarm — Overdraft limit reached, rendering paused',
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f1117;border-radius:8px;color:#e2e8f0">
        <div style="background:#7f1d1d;border-radius:6px;padding:4px 14px;display:inline-block;margin-bottom:16px;font-size:13px;font-weight:600;color:#fca5a5;">
          OVERDRAFT LIMIT REACHED
        </div>
        <h2 style="color:#fff;margin-top:0">Your rendering has been paused</h2>
        <p style="color:#94a3b8;">Your account balance has reached <strong style="color:#f87171">$${balance.toFixed(2)}</strong>, which exceeds the overdraft limit of <strong>$${overdraftLimit.toFixed(2)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
          <tr><td style="padding:8px 4px;color:#64748b;width:140px">Current balance</td><td style="padding:8px 4px;color:#f87171;font-weight:600">$${balance.toFixed(2)}</td></tr>
          <tr><td style="padding:8px 4px;color:#64748b">Overdraft limit</td><td style="padding:8px 4px;color:#fff">$${overdraftLimit.toFixed(2)}</td></tr>
          <tr><td style="padding:8px 4px;color:#64748b">Jobs affected</td><td style="padding:8px 4px;color:#fff">${killedJobs.length} job${killedJobs.length !== 1 ? 's' : ''} stopped</td></tr>
        </table>
        <p style="color:#94a3b8;">Add credits to your account to resume rendering. All queued jobs will restart automatically once your balance is above -$20.</p>
        <a href="${dashUrl}/billing" style="display:inline-block;margin-top:8px;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Add Credits →</a>
        <p style="color:#475569;font-size:12px;margin-top:24px;">
          <a href="${dashUrl}" style="color:#475569">View Dashboard</a>
        </p>
      </div>`,
  }).catch(() => null)

  // Notify admin
  const adminRows = await sql`SELECT email FROM users WHERE is_admin = TRUE AND is_active = TRUE LIMIT 1` as Record<string, unknown>[]
  const adminEmail = adminRows[0]?.email as string | undefined
  if (adminEmail) {
    sendEmail({
      to: adminEmail,
      subject: `[Admin] Overdraft limit exceeded — ${email} ($${balance.toFixed(2)})`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#fff">
          <h2 style="color:#dc2626;margin-top:0">Overdraft Limit Exceeded</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 4px;color:#888;width:130px">User</td><td style="padding:6px 4px;">${email}</td></tr>
            <tr><td style="padding:6px 4px;color:#888">Balance</td><td style="padding:6px 4px;color:#dc2626;font-weight:600">$${balance.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 4px;color:#888">Limit</td><td style="padding:6px 4px;">$${overdraftLimit.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 4px;color:#888">Jobs stopped</td><td style="padding:6px 4px;">${killedJobs.length}</td></tr>
          </table>
          <p><a href="${dashUrl}/admin" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;border-radius:5px;text-decoration:none;font-weight:600">Go to Admin →</a></p>
        </div>`,
    }).catch(() => null)
  }

  console.log(`[overdraft] User ${userId} (${email}) exceeded limit: $${balance.toFixed(2)} — ${killedJobs.length} jobs stopped`)
}

/** Called when a credit grant brings balance above 0 — releases debt-held jobs. */
export async function clearDebtHold(userId: number, email?: string): Promise<void> {
  const rows = await sql`SELECT debt_hold_since FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
  if (!rows.length || !rows[0].debt_hold_since) return  // not in debt hold

  await sql`
    UPDATE users SET debt_hold_since = NULL, overdraft_notified = FALSE, low_balance_notified_at = NULL
    WHERE id = ${userId}
  `

  // Release all debt-held jobs back to pending
  const released = await sql`
    UPDATE jobs SET status = 'pending', held_for_debt = FALSE,
      status_description = 'Released from debt hold — credits restored'
    WHERE user_id = ${userId} AND (held_for_debt = TRUE OR status = 'holding')
      AND status NOT IN ('success','failed','killed','downloaded')
    RETURNING job_number, title
  ` as Record<string, unknown>[]

  if (released.length > 0 && email) {
    sendEmail({
      to: email,
      subject: '✓ Renderfarm — Credits restored, rendering resumed',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f1117;border-radius:8px;color:#e2e8f0">
          <h2 style="color:#fff;margin-top:0">Rendering Resumed</h2>
          <p style="color:#94a3b8;">Your credits have been restored. <strong>${released.length} held job${released.length !== 1 ? 's' : ''}</strong> have been released and will start rendering now.</p>
          <a href="${baseUrl()}/" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#0d9488;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">View Jobs →</a>
        </div>`,
    }).catch(() => null)
  }

  console.log(`[overdraft] User ${userId} debt hold cleared — ${released.length} jobs released`)
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
