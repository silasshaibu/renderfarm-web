/**
 * lib/rateLimit.ts — Sliding-window rate limiter backed by Neon DB
 *
 * No Redis or external service required.  The `rate_limit_log` table is created
 * by initDB(); always call initDB() before rateLimit() in route handlers.
 *
 * Usage:
 *   const rl = await rateLimit(`login:${ip}`, 10, 15 * 60)
 *   if (!rl.allowed) return NextResponse.json({ message: '...' }, { status: 429 })
 */

import { sql } from './db'

export interface RateLimitResult {
  allowed:    boolean
  remaining:  number   // requests still allowed in current window
  retryAfter: number   // seconds until oldest slot expires (0 when allowed)
}

/**
 * Check and record a rate-limited action.
 *
 * @param key        Unique key for the caller + action, e.g. "login:1.2.3.4"
 * @param limit      Max requests allowed in the window
 * @param windowSecs Window length in seconds
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSecs: number,
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowSecs * 1000).toISOString()

  // Count attempts in the current window
  const countRows = await sql`
    SELECT COUNT(*)::int AS n
    FROM   rate_limit_log
    WHERE  key = ${key} AND created_at > ${windowStart}
  ` as Array<{ n: number }>

  const count = countRows[0]?.n ?? 0

  if (count >= limit) {
    // How long until the oldest slot falls out of the window
    const oldestRows = await sql`
      SELECT created_at
      FROM   rate_limit_log
      WHERE  key = ${key} AND created_at > ${windowStart}
      ORDER  BY created_at ASC
      LIMIT  1
    ` as Array<{ created_at: string }>

    const oldest     = oldestRows[0]?.created_at
    const retryAfter = oldest
      ? Math.ceil((new Date(oldest).getTime() + windowSecs * 1000 - Date.now()) / 1000)
      : windowSecs

    return { allowed: false, remaining: 0, retryAfter: Math.max(1, retryAfter) }
  }

  // Record this attempt
  await sql`INSERT INTO rate_limit_log (key) VALUES (${key})`

  // Lazy cleanup (≈10% of requests) — removes entries older than 2× the window
  if (Math.random() < 0.1) {
    const oldBefore = new Date(Date.now() - 2 * windowSecs * 1000).toISOString()
    // Fire-and-forget — don't await, don't block the response
    sql`DELETE FROM rate_limit_log WHERE created_at < ${oldBefore}`.catch(() => {})
  }

  return { allowed: true, remaining: limit - count - 1, retryAfter: 0 }
}

/**
 * Extract the caller's IP from a Next.js request.
 * Reads x-forwarded-for (set by Vercel) then x-real-ip, then falls back.
 */
export function getIP(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip')?.trim() ??
    'unknown'
  )
}

/** Human-friendly "try again in X minutes" message. */
export function retryMessage(retryAfter: number): string {
  const mins = Math.ceil(retryAfter / 60)
  return mins <= 1
    ? 'Too many attempts. Please try again in a moment.'
    : `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`
}
