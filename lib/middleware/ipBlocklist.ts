import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'

export async function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.ip ?? '0.0.0.0'
}

/**
 * Check if IP is blocked. Returns error response if blocked, null if allowed.
 */
export async function checkIPBlocklist(req: NextRequest): Promise<NextResponse | null> {
  try {
    await initDB()

    const ip = getClientIP(req)

    // Check if IP is currently blocked
    const blockedRows = await sql`
      SELECT id FROM ip_blocklist
      WHERE ip_address = ${ip}
      AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    ` as Record<string, unknown>[]

    if (blockedRows.length > 0) {
      // Log the blocked attempt
      await sql`
        INSERT INTO blocked_attempts (ip_address, attempted_at, endpoint, user_agent)
        VALUES (${ip}, NOW(), ${req.nextUrl.pathname}, ${req.headers.get('user-agent') ?? ''})
      `.catch(() => null)

      return NextResponse.json(
        { error: 'access_denied', message: 'Access denied' },
        { status: 403 }
      )
    }
  } catch (e) {
    // If IP check fails, allow the request (fail open)
    console.error('[ip-blocklist] check error:', e)
  }

  return null
}

/**
 * Block an IP address.
 * @param ip IP address to block
 * @param reason Reason for blocking
 * @param expiresInHours Hours until block expires (null = permanent)
 */
export async function blockIP(
  ip: string,
  reason: string,
  expiresInHours: number | null = null
): Promise<void> {
  try {
    await initDB()

    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 3600 * 1000)
      : null

    await sql`
      INSERT INTO ip_blocklist (ip_address, reason, blocked_by, expires_at)
      VALUES (${ip}, ${reason}, 'system', ${expiresAt})
      ON CONFLICT (ip_address) DO UPDATE
      SET reason = EXCLUDED.reason,
          blocked_at = NOW(),
          expires_at = EXCLUDED.expires_at
    `

    console.log(`[ip-blocklist] Blocked ${ip}: ${reason}${expiresInHours ? ` (${expiresInHours}h)` : ' (permanent)'}`)
  } catch (e) {
    console.error('[ip-blocklist] block error:', e)
  }
}
