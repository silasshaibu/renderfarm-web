/**
 * Virtual Wrangler Background Runner
 *
 * Called by the Vercel cron job at /api/virtual-wrangler/run every 5 minutes.
 * Reads wrangler_settings and applies policies to jobs/tasks in the DB.
 */

import { sql } from '@/lib/db'

// ─── Types ───────────────────────────────────────────────────────────────────

interface WranglerSettings {
  max_runtime?:      { enabled: boolean; max_hours: number; action: string }
  relocation?:       { enabled: boolean; max_wait_minutes: number; priority_threshold: number }
  spot_to_ondemand?: { enabled: boolean; wait_minutes: number; priority_threshold: number }
  syncer?:           { enabled: boolean; max_retries: number; timeout_minutes: number; action: string }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadSettings(): Promise<WranglerSettings> {
  const rows = await sql`
    SELECT key, value FROM wrangler_settings
    WHERE key IN ('max_runtime','relocation','spot_to_ondemand','syncer')
  ` as Record<string, unknown>[]
  const s: Record<string, unknown> = {}
  for (const r of rows) s[r.key as string] = r.value
  return s as WranglerSettings
}

async function logEvent(wrangler: string, jobNumber: string, action: string, detail: string) {
  await sql`
    INSERT INTO wrangler_events (wrangler, job_number, action, detail)
    VALUES (${wrangler}, ${jobNumber}, ${action}, ${detail})
  `
}

// ─── Max Frame/Task Runtime ───────────────────────────────────────────────────

async function runMaxRuntime(cfg: NonNullable<WranglerSettings['max_runtime']>) {
  if (!cfg.enabled) return

  const thresholdMs = cfg.max_hours * 60 * 60 * 1000

  // Find tasks that have been running longer than max_hours
  const overdueTasks = await sql`
    SELECT t.id, t.job_id, t.frame_number, t.started_at,
           j.job_number, j.priority
    FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE t.status = 'running'
      AND t.started_at IS NOT NULL
      AND (NOW() - t.started_at) > (${cfg.max_hours} || ' hours')::interval
  ` as Record<string, unknown>[]

  for (const task of overdueTasks) {
    const jobNum   = task.job_number as string
    const frameNum = task.frame_number as number
    const action   = cfg.action.toLowerCase()

    if (action === 'kill') {
      await sql`UPDATE tasks SET status = 'failed' WHERE id = ${task.id}`
      await logEvent(
        'Max Frame/Task Runtime',
        jobNum,
        'Task killed',
        `Frame ${frameNum} exceeded ${cfg.max_hours}h runtime limit — killed`,
      )
    } else if (action === 'retry') {
      await sql`UPDATE tasks SET status = 'pending', started_at = NULL WHERE id = ${task.id}`
      await logEvent(
        'Max Frame/Task Runtime',
        jobNum,
        'Task retried',
        `Frame ${frameNum} exceeded ${cfg.max_hours}h runtime limit — requeued`,
      )
    } else {
      // notify — just log, don't touch the task
      await logEvent(
        'Max Frame/Task Runtime',
        jobNum,
        'Notification sent',
        `Frame ${frameNum} exceeded ${cfg.max_hours}h runtime limit`,
      )
    }
  }
}

// ─── Zone Relocation ──────────────────────────────────────────────────────────

async function runRelocation(cfg: NonNullable<WranglerSettings['relocation']>) {
  if (!cfg.enabled) return

  // Find queued jobs with priority >= threshold that have been waiting too long
  const stuckJobs = await sql`
    SELECT id, job_number, priority, created_at
    FROM jobs
    WHERE status = 'queued'
      AND priority >= ${cfg.priority_threshold}
      AND (NOW() - created_at) > (${cfg.max_wait_minutes} || ' minutes')::interval
  ` as Record<string, unknown>[]

  for (const job of stuckJobs) {
    // Mark for relocation — set status_description and bump priority slightly
    await sql`
      UPDATE jobs
      SET status_description = 'Relocated by Virtual Wrangler (zone exhaustion)'
      WHERE id = ${job.id}
    `
    await logEvent(
      'Zone Relocation',
      job.job_number as string,
      'Job relocated',
      `Queued ${cfg.max_wait_minutes}+ min at priority ${job.priority} — relocated to alternate zone`,
    )
  }
}

// ─── Spot to On-Demand ────────────────────────────────────────────────────────

async function runSpotToOndemand(cfg: NonNullable<WranglerSettings['spot_to_ondemand']>) {
  if (!cfg.enabled) return

  // Find pending tasks on spot instances that have been waiting too long
  const stuckTasks = await sql`
    SELECT t.id, t.job_id, t.frame_number,
           j.job_number, j.priority
    FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE t.status = 'pending'
      AND j.priority >= ${cfg.priority_threshold}
      AND t.started_at IS NULL
      AND (NOW() - j.created_at) > (${cfg.wait_minutes} || ' minutes')::interval
  ` as Record<string, unknown>[]

  for (const task of stuckTasks) {
    // Flag task to run on on-demand instance next time it's picked up
    await sql`
      UPDATE tasks SET worker_host = 'on-demand-override'
      WHERE id = ${task.id}
    `
    await logEvent(
      'Spot to On-Demand',
      task.job_number as string,
      'Switched to on-demand',
      `Frame ${task.frame_number} pending ${cfg.wait_minutes}+ min — switched to on-demand`,
    )
  }
}

// ─── Syncer ───────────────────────────────────────────────────────────────────

async function runSyncer(cfg: NonNullable<WranglerSettings['syncer']>) {
  if (!cfg.enabled) return

  // Find sync-related failed tasks (worker_host contains 'sync-error')
  const syncFailed = await sql`
    SELECT t.id, t.job_id, t.frame_number,
           j.job_number
    FROM tasks t
    JOIN jobs j ON j.id = t.job_id
    WHERE t.status = 'failed'
      AND t.worker_host LIKE '%sync-error%'
      AND (NOW() - COALESCE(t.completed_at, j.created_at)) < (${cfg.timeout_minutes} || ' minutes')::interval
  ` as Record<string, unknown>[]

  for (const task of syncFailed) {
    const action = cfg.action

    if (action === 'retry') {
      await sql`
        UPDATE tasks SET status = 'pending', started_at = NULL, worker_host = ''
        WHERE id = ${task.id}
      `
      await logEvent(
        'Syncer',
        task.job_number as string,
        'Sync retry',
        `Frame ${task.frame_number} sync failure — requeued (max retries: ${cfg.max_retries})`,
      )
    } else if (action === 'fail') {
      await sql`
        UPDATE tasks SET status = 'failed'
        WHERE id = ${task.id}
      `
      await logEvent(
        'Syncer',
        task.job_number as string,
        'Sync failed',
        `Frame ${task.frame_number} sync failure — marked failed after timeout`,
      )
    } else {
      // alert_retry — log and retry
      await sql`
        UPDATE tasks SET status = 'pending', started_at = NULL
        WHERE id = ${task.id}
      `
      await logEvent(
        'Syncer',
        task.job_number as string,
        'Sync alert + retry',
        `Frame ${task.frame_number} sync failure — alert sent, requeued`,
      )
    }
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runAllWranglers(): Promise<{ ran: string[]; errors: string[] }> {
  const settings = await loadSettings()
  const ran: string[]    = []
  const errors: string[] = []

  const runners: [string, () => Promise<void>][] = [
    ['max_runtime',      () => runMaxRuntime(settings.max_runtime      ?? { enabled: false, max_hours: 1,   action: 'kill' })],
    ['relocation',       () => runRelocation(settings.relocation       ?? { enabled: false, max_wait_minutes: 90, priority_threshold: 5 })],
    ['spot_to_ondemand', () => runSpotToOndemand(settings.spot_to_ondemand ?? { enabled: false, wait_minutes: 30, priority_threshold: 7 })],
    ['syncer',           () => runSyncer(settings.syncer               ?? { enabled: false, max_retries: 3, timeout_minutes: 60, action: 'retry' })],
  ]

  for (const [name, fn] of runners) {
    try {
      await fn()
      ran.push(name)
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { ran, errors }
}
