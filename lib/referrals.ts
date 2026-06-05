import { sql, initDB } from './db'
import { addCredit } from './credits'
import { hasActiveCard, getUsageConsumed } from './billing'
import { sendEmail, baseUrl } from './email'

export const REFERRAL_REWARD = 15.00
export const REFERRAL_SPEND_REQUIREMENT = 15.00

export async function ensureReferralSchema(): Promise<void> {
  await initDB()

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER`.catch(() => null)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code)`.catch(() => null)

  await sql`
    CREATE TABLE IF NOT EXISTS referrals (
      id           SERIAL PRIMARY KEY,
      referrer_id  INTEGER NOT NULL,
      referee_id   INTEGER NOT NULL UNIQUE,
      status       TEXT DEFAULT 'pending',
      reward       NUMERIC(10,2) DEFAULT 15.00,
      ip_match     BOOLEAN DEFAULT FALSE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      credited_at  TIMESTAMPTZ NULL
    )
  `.catch(() => null)
  await sql`CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id)`.catch(() => null)

  // Widen the credits type CHECK to allow 'referral'
  await sql`ALTER TABLE credits DROP CONSTRAINT IF EXISTS credits_type_check`.catch(() => null)
  await sql`
    ALTER TABLE credits ADD CONSTRAINT credits_type_check CHECK (type IN
      ('welcome_bonus','purchased','admin_grant','refund','usage','referral'))
  `.catch(() => null)
}

function randomCode(): string {
  // 8-char base36, uppercase, no ambiguous chars
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

/** Return the user's referral code, generating a unique one if absent. */
export async function getOrCreateReferralCode(userId: number): Promise<string> {
  await ensureReferralSchema()

  const rows = await sql`SELECT referral_code FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
  if (rows.length && rows[0].referral_code) return rows[0].referral_code as string

  // Generate a unique code (retry on collision)
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = randomCode()
    try {
      const upd = await sql`
        UPDATE users SET referral_code = ${code}
        WHERE id = ${userId} AND (referral_code IS NULL OR referral_code = '')
        RETURNING referral_code
      ` as Record<string, unknown>[]
      if (upd.length) return upd[0].referral_code as string
      // Already had one set concurrently
      const re = await sql`SELECT referral_code FROM users WHERE id = ${userId} LIMIT 1` as Record<string, unknown>[]
      if (re[0]?.referral_code) return re[0].referral_code as string
    } catch {
      // unique collision — try another code
    }
  }
  throw new Error('Could not generate referral code')
}

/**
 * Record that a newly-created referee signed up via a referral code.
 * Guards self-referral and double-referral. Flags shared-IP for review.
 */
export async function recordReferralSignup(
  refereeId: number,
  code: string | undefined | null,
  refereeIp?: string
): Promise<void> {
  if (!code) return
  await ensureReferralSchema()

  const refRows = await sql`
    SELECT id, registration_ip FROM users WHERE referral_code = ${code.toUpperCase()} LIMIT 1
  ` as Record<string, unknown>[]
  if (!refRows.length) return // invalid code — ignore

  const referrerId = Number(refRows[0].id)
  if (referrerId === refereeId) return // self-referral

  // Already referred?
  const existing = await sql`SELECT id FROM referrals WHERE referee_id = ${refereeId} LIMIT 1` as Record<string, unknown>[]
  if (existing.length) return

  const referrerIp = String(refRows[0].registration_ip ?? '')
  const ipMatch = Boolean(refereeIp && referrerIp && refereeIp === referrerIp)

  await sql`
    INSERT INTO referrals (referrer_id, referee_id, status, reward, ip_match)
    VALUES (${referrerId}, ${refereeId}, 'pending', ${REFERRAL_REWARD}, ${ipMatch})
    ON CONFLICT (referee_id) DO NOTHING
  `.catch(() => null)

  await sql`UPDATE users SET referred_by = ${referrerId} WHERE id = ${refereeId}`.catch(() => null)
}

/**
 * Pay the referrer once the referee has a card on file AND has spent >= $15.
 * Idempotent — safe to call repeatedly (e.g. on every task-complete).
 */
export async function creditReferralIfQualified(refereeId: number): Promise<boolean> {
  try {
    await ensureReferralSchema()

    const rows = await sql`
      SELECT id, referrer_id FROM referrals
      WHERE referee_id = ${refereeId} AND status = 'pending'
      LIMIT 1
    ` as Record<string, unknown>[]
    if (!rows.length) return false

    const referralId = Number(rows[0].id)
    const referrerId = Number(rows[0].referrer_id)

    // Both gates: card on file AND >= $15 of real spend
    const cardOk = await hasActiveCard(refereeId)
    if (!cardOk) return false
    const spend = await getUsageConsumed(refereeId)
    if (spend < REFERRAL_SPEND_REQUIREMENT) return false

    // Atomically claim the referral so we never double-pay
    const claimed = await sql`
      UPDATE referrals SET status = 'credited', credited_at = NOW()
      WHERE id = ${referralId} AND status = 'pending'
      RETURNING id
    ` as Record<string, unknown>[]
    if (!claimed.length) return false // someone else credited it

    // Grant the referrer their rendering credit
    await addCredit({
      userId: referrerId,
      amount: REFERRAL_REWARD,
      type: 'referral',
      description: `Referral reward — friend reached $${REFERRAL_SPEND_REQUIREMENT.toFixed(0)} of rendering`,
    })

    // Email the referrer
    const refRows = await sql`SELECT email FROM users WHERE id = ${referrerId} LIMIT 1` as Record<string, unknown>[]
    const email = refRows[0]?.email as string | undefined
    if (email) {
      sendEmail({
        to: email,
        subject: `🎉 You earned $${REFERRAL_REWARD.toFixed(0)} rendering credit`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f1117;border-radius:8px;color:#e2e8f0">
            <h2 style="color:#fff;margin-top:0">Referral Reward Earned</h2>
            <p style="color:#94a3b8;">A friend you referred is now an active renderer — <strong>$${REFERRAL_REWARD.toFixed(2)}</strong> of rendering credit has been added to your account.</p>
            <a href="${baseUrl()}/" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Go to Dashboard →</a>
          </div>`,
      }).catch(() => null)
    }

    return true
  } catch (e) {
    console.error('[referrals] creditReferralIfQualified error:', e)
    return false
  }
}

/** Stats for the user's referral dashboard card. */
export async function getReferralStats(userId: number) {
  const code = await getOrCreateReferralCode(userId)
  const rows = await sql`
    SELECT status, COALESCE(SUM(reward), 0) AS total, COUNT(*) AS cnt
    FROM referrals WHERE referrer_id = ${userId}
    GROUP BY status
  ` as Record<string, unknown>[]

  let pending = 0, credited = 0, earned = 0
  for (const r of rows) {
    const cnt = Number(r.cnt ?? 0)
    if (r.status === 'pending')  pending = cnt
    if (r.status === 'credited') { credited = cnt; earned = Number(r.total ?? 0) }
  }

  return {
    code,
    link: `${baseUrl()}/register?ref=${code}`,
    pending,
    credited,
    earned: Math.round(earned * 100) / 100,
    reward: REFERRAL_REWARD,
    spendRequirement: REFERRAL_SPEND_REQUIREMENT,
  }
}
