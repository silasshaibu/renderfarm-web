import { sql, initDB } from '@/lib/db'
import { blockIP } from './middleware/ipBlocklist'
import { sendEmail, baseUrl } from './email'

export const ABUSE_THRESHOLDS = {
  WATCH: 30,           // 30+ points: flag for review
  RESTRICT: 60,        // 60+ points: reduce upload limits
  SUSPEND_UPLOADS: 90, // 90+ points: block uploads
  AUTO_SUSPEND: 120,   // 120+ points: auto-suspend account
}

export const SCORE_DELTAS = {
  RAPID_UPLOAD: 10,                      // >5GB in 10 min
  DAILY_LIMIT_EXCEEDED: 20,              // tried to exceed daily quota
  LARGE_UPLOAD_NO_RENDER: 30,            // 20GB+ uploaded, no jobs in 24h
  DUPLICATE_CONTENT_MULTI_ACCOUNT: 30,   // same file from 2+ accounts
  STORAGE_CREDIT_RATIO: 40,              // >50GB storage / <$1 spend
  IP_FLOOD: 50,                          // 3+ accounts on same IP
  REPEATED_NEW_ACCOUNTS_SAME_IP: 100,    // 3+ new accounts claiming bonus from IP
  FILE_TOO_LARGE: 10,                    // tried to upload >10GB file

  RENDER_JOB_COMPLETED: -5,              // legit render reduces score
  PAYMENT_MADE: -10,                     // payment reduces score
  CLEAN_30_DAYS: -20,                    // no abuse signals in 30 days
}

interface AbuseSignalData {
  user_id: number
  ip_address: string
  signal_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  delta: number
  details: Record<string, unknown>
}

/**
 * Record an abuse signal and update user's score.
 */
export async function recordAbuseSignal(data: AbuseSignalData): Promise<void> {
  try {
    await initDB()

    // Insert signal
    await sql`
      INSERT INTO abuse_signals
        (user_id, ip_address, signal_type, severity, details)
      VALUES (${data.user_id}, ${data.ip_address}, ${data.signal_type},
              ${data.severity}, ${JSON.stringify(data.details)})
    `.catch(() => null)

    // Update score
    await updateAbuseScore(data.user_id, data.delta, data.signal_type)
  } catch (e) {
    console.error('[abuse-scoring] signal error:', e)
  }
}

/**
 * Update user's abuse score and apply automatic actions.
 */
export async function updateAbuseScore(
  userId: number,
  delta: number,
  reason: string
): Promise<number> {
  try {
    await initDB()

    // Insert or update score
    const scoreRows = await sql`
      INSERT INTO user_abuse_scores (user_id, score, last_updated)
      VALUES (${userId}, ${Math.max(0, delta)}, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET score = GREATEST(0, user_abuse_scores.score + ${delta}),
          last_updated = NOW()
      RETURNING score
    ` as Record<string, unknown>[]

    const newScore = Number(scoreRows[0]?.score ?? 0)

    // Log the change
    await sql`
      INSERT INTO audit_log (admin_id, target_user_id, action, details)
      VALUES (0, ${userId}, 'abuse_score_updated', ${JSON.stringify({ delta, reason, newScore })})
    `.catch(() => null)

    // Apply automatic actions
    await applyAbuseScoreActions(userId, newScore)

    return newScore
  } catch (e) {
    console.error('[abuse-scoring] update error:', e)
    return 0
  }
}

/**
 * Apply automatic actions based on abuse score threshold.
 */
export async function applyAbuseScoreActions(userId: number, score: number): Promise<void> {
  try {
    await initDB()

    const userRows = await sql`
      SELECT email FROM users WHERE id = ${userId} LIMIT 1
    ` as Record<string, unknown>[]
    const email = userRows[0]?.email as string | undefined

    if (score >= ABUSE_THRESHOLDS.AUTO_SUSPEND) {
      // Auto-suspend account
      await sql`
        UPDATE users
        SET status = 'suspended',
            suspension_reason = 'Auto-suspended: abuse score exceeded 120',
            suspended_at = NOW()
        WHERE id = ${userId}
      `.catch(() => null)

      if (email) {
        sendEmail({
          to: email,
          subject: 'Account suspended — unusual activity detected',
          html: `
            <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
              <h2 style="color:#f87171;margin-top:0">Account Suspended</h2>
              <p style="color:#94a3b8;">Your account has been automatically suspended due to unusual activity patterns.</p>
              <p style="color:#94a3b8;">If you believe this is an error, please contact support@renderfarm.swade-art.com</p>
            </div>`,
        }).catch(() => null)
      }

      console.log(`[abuse-scoring] User ${userId} auto-suspended (score: ${score})`)
    } else if (score >= ABUSE_THRESHOLDS.SUSPEND_UPLOADS) {
      // Block uploads
      await sql`
        UPDATE users SET uploads_blocked = true WHERE id = ${userId}
      `.catch(() => null)

      if (email) {
        sendEmail({
          to: email,
          subject: '⚠ File uploads blocked on your account',
          html: `
            <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
              <h2 style="color:#fbbf24">Uploads Blocked</h2>
              <p style="color:#94a3b8;">File uploads on your account have been temporarily blocked due to unusual activity patterns.</p>
              <p style="color:#94a3b8;">You can still view and manage your existing jobs. Contact support if you have questions.</p>
            </div>`,
        }).catch(() => null)
      }

      console.log(`[abuse-scoring] User ${userId} uploads blocked (score: ${score})`)
    } else if (score >= ABUSE_THRESHOLDS.RESTRICT) {
      // Restrict upload limits
      await sql`
        UPDATE users SET upload_limit_multiplier = 0.5 WHERE id = ${userId}
      `.catch(() => null)

      console.log(`[abuse-scoring] User ${userId} upload limits restricted (score: ${score})`)
    }
  } catch (e) {
    console.error('[abuse-scoring] apply actions error:', e)
  }
}

/**
 * Check for users with high abuse scores and flag them.
 * Run periodically or on-demand.
 */
export async function auditHighScoreUsers(): Promise<number> {
  try {
    await initDB()

    const highScoreRows = await sql`
      SELECT uas.user_id, uas.score, u.email
      FROM user_abuse_scores uas
      JOIN users u ON u.id = uas.user_id
      WHERE uas.score >= ${ABUSE_THRESHOLDS.WATCH}
      AND u.status != 'suspended'
      ORDER BY uas.score DESC
      LIMIT 100
    ` as Record<string, unknown>[]

    return highScoreRows.length
  } catch (e) {
    console.error('[abuse-scoring] audit error:', e)
    return 0
  }
}

/**
 * Decay score over time — clean accounts lose 20 points per 30 days.
 * Run this weekly or monthly.
 */
export async function decayAbuseScores(): Promise<number> {
  try {
    await initDB()

    const updated = await sql`
      UPDATE user_abuse_scores
      SET score = GREATEST(0, score - 5)
      WHERE last_updated < NOW() - INTERVAL '7 days'
      RETURNING user_id
    ` as Record<string, unknown>[]

    return updated.length
  } catch (e) {
    console.error('[abuse-scoring] decay error:', e)
    return 0
  }
}
