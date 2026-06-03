/**
 * lib/notifications.ts — Job completion notification helpers.
 * Called from task-complete route when a job transitions to success/failed.
 */
import { sql } from './db'
import { sendEmail, jobCompleteEmail, jobFailedEmail, baseUrl } from './email'
import { getBalance } from './credits'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

export function makeUnsubToken(userId: number): string {
  return jwt.sign({ sub: String(userId), type: 'notif_unsub' }, JWT_SECRET, { expiresIn: '365d' })
}

export function verifyUnsubToken(token: string): number | null {
  try {
    const p = jwt.verify(token, JWT_SECRET, { ignoreExpiration: false }) as Record<string, unknown>
    if (p.type !== 'notif_unsub') return null
    return Number(p.sub)
  } catch {
    return null
  }
}

/** Ensure notification columns exist on jobs and users tables. */
export async function ensureNotificationSchema() {
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notification_email   BOOLEAN DEFAULT FALSE`.catch(() => null)
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notification_sound   BOOLEAN DEFAULT FALSE`.catch(() => null)
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notification_on      TEXT    DEFAULT 'BOTH'`.catch(() => null)
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notification_sent    BOOLEAN DEFAULT FALSE`.catch(() => null)
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ DEFAULT NULL`.catch(() => null)

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email         BOOLEAN DEFAULT TRUE`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_job_completed BOOLEAN DEFAULT TRUE`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_job_failed    BOOLEAN DEFAULT TRUE`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_weekly_report BOOLEAN DEFAULT FALSE`.catch(() => null)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_on            TEXT    DEFAULT 'BOTH'`.catch(() => null)
}

function fmtDuration(seconds: number): string {
  if (seconds < 60)  return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

/**
 * Send a job completion notification email.
 * Checks notification_sent flag to prevent duplicates.
 */
export async function sendJobNotification(jobId: string | number, newStatus: 'success' | 'failed') {
  try {
    await ensureNotificationSchema()

    const jobRows = await sql`
      SELECT j.id, j.job_number, j.title, j.user_id, j.notification_email,
             j.notification_on, j.notification_sent, j.cost_usd, j.created_at, j.updated_at,
             u.email AS user_email, u.notify_email AS user_notify_email
      FROM jobs j
      JOIN users u ON u.id = j.user_id
      WHERE j.id = ${jobId}
      LIMIT 1
    ` as Record<string, unknown>[]

    if (!jobRows.length) return
    const job = jobRows[0]

    // Already sent — prevent duplicates
    if (job.notification_sent) return

    const notifyOn      = String(job.notification_on ?? 'BOTH')
    const notifyEmail   = Boolean(job.notification_email) && Boolean(job.user_notify_email)
    const userEmail     = job.user_email as string | null
    const userId        = Number(job.user_id)
    const jobNumber     = String(job.job_number)
    const title         = String(job.title)

    // Check if this status should trigger a notification
    const shouldNotify =
      (notifyOn === 'SUCCESS' && newStatus === 'success') ||
      (notifyOn === 'FAILURE' && newStatus === 'failed')  ||
      notifyOn === 'BOTH'

    if (!shouldNotify || !userEmail) return

    // Mark sent before sending (prevents duplicates even on crash-retry)
    await sql`
      UPDATE jobs SET notification_sent = TRUE, notification_sent_at = NOW()
      WHERE id = ${jobId}
    `

    if (notifyEmail) {
      const unsubToken = makeUnsubToken(userId)
      const balance    = await getBalance(userId).catch(() => null)

      // Compute duration from created_at → updated_at
      const createdMs  = new Date(job.created_at as string).getTime()
      const updatedMs  = new Date(job.updated_at as string).getTime()
      const durationSec = Math.max(0, (updatedMs - createdMs) / 1000)

      if (newStatus === 'success') {
        // Get frame count from tasks
        const taskRows = await sql`SELECT COUNT(*) AS cnt FROM tasks WHERE job_id = ${jobId} AND status IN ('success','complete','done')` as Record<string, unknown>[]
        const frameCount = Number((taskRows[0] as Record<string, unknown>)?.cnt ?? 1)
        await sendEmail({
          to:      userEmail,
          subject: `✓ Render complete — ${title} (#${jobNumber})`,
          html:    jobCompleteEmail({
            email:      userEmail,
            jobNumber,
            title,
            frameCount,
            duration:   fmtDuration(durationSec),
            costUsd:    Number(job.cost_usd ?? 0),
            balance:    balance ?? undefined,
            unsubToken,
          }),
        })
      } else {
        await sendEmail({
          to:      userEmail,
          subject: `✗ Render failed — ${title} (#${jobNumber})`,
          html:    jobFailedEmail({
            email:      userEmail,
            jobNumber,
            title,
            unsubToken,
          }),
        })
      }
    }
  } catch (err) {
    console.error('[notifications] sendJobNotification error:', err)
  }
}
