import { sql } from '@/lib/db'

/**
 * Recompute and write job status from actual task rows.
 *
 * Rules (evaluated in order):
 *   1. Any task running              → job = 'running'
 *   2. Any task pending/queued       → job = 'pending'
 *   3. All tasks done/complete       → job = 'success'
 *   4. No running or pending tasks   → job = 'holding'  (stuck — needs attention)
 *
 * Does NOT override user-set terminal statuses: holding (explicit), killed, success, downloaded.
 */
export async function syncJobStatus(
  jobIdInt : number,
  jobId    : string,
  currentStatus: string,
): Promise<void> {
  // Never downgrade a job that the user explicitly stopped or already finished
  if (['killed', 'success', 'downloaded'].includes(currentStatus)) return

  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'running')                                             AS running_cnt,
      COUNT(*) FILTER (WHERE status IN ('pending', 'queued'))                                AS pending_cnt,
      COUNT(*) FILTER (WHERE status IN ('complete', 'success', 'done', 'reviewed', 'downloaded')) AS done_cnt,
      COUNT(*)                                                                               AS total_cnt
    FROM tasks
    WHERE job_id = ${jobIdInt}
  `

  const row = rows[0] as Record<string, unknown>
  const running = Number(row.running_cnt)
  const pending = Number(row.pending_cnt)
  const done    = Number(row.done_cnt)
  const total   = Number(row.total_cnt)

  let next: string
  if (running > 0) {
    next = 'running'
  } else if (pending > 0) {
    next = 'pending'
  } else if (total > 0 && done === total) {
    next = 'success'
  } else {
    next = 'holding'
  }

  if (next !== currentStatus) {
    await sql`UPDATE jobs SET status = ${next}, updated_at = NOW() WHERE id = ${jobId}`
    console.log(`[syncJobStatus] job ${jobId}: ${currentStatus} → ${next} (running=${running} pending=${pending} done=${done}/${total})`)
  }
}
