/**
 * Server-side auth helpers shared by all API routes.
 *
 * Session model:
 *   - Every token carries a unique `jti` (UUID).
 *   - user_sessions is the source of truth for expiry.
 *   - JWT signature is verified but JWT expiry is IGNORED —
 *     the DB session expires_at is what matters.
 *   - Sliding renewal: if session expires within 12 h, it is
 *     automatically extended to NOW() + 24 h on every request.
 *   - Deleting a row from user_sessions immediately revokes access.
 */
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql } from './db'

export const JWT_SECRET =
  process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

export const SESSION_TTL_MS  = 24 * 60 * 60 * 1000   // 24 hours
export const RENEW_WITHIN_MS = 12 * 60 * 60 * 1000   // renew when <12 h left

export interface TokenPayload {
  sub:     string
  email:   string
  isAdmin: boolean
  jti?:    string
}

/**
 * Verify the Bearer token.
 *
 * - Checks JWT signature (ignores JWT-level expiry — DB is the authority).
 * - For tokens with a jti: validates against user_sessions.expires_at.
 * - Sliding renewal: extends the session if <12 h remain.
 * - For legacy tokens without a jti: falls back to JWT expiry.
 */
export async function verifyToken(req: NextRequest): Promise<TokenPayload | null> {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  let payload: TokenPayload
  try {
    // ignoreExpiration = DB session is the expiry authority
    payload = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as TokenPayload
  } catch {
    return null
  }

  if (payload.jti) {
    try {
      const rows = await sql`
        SELECT id, expires_at
        FROM user_sessions
        WHERE jti = ${payload.jti}
          AND revoked = FALSE
          AND expires_at > NOW()
        LIMIT 1
      ` as Record<string, unknown>[]

      if (!rows.length) return null  // session expired or revoked

      // Sliding renewal: extend if <12 h remain
      const expiresAt  = new Date(rows[0].expires_at as string)
      const remaining  = expiresAt.getTime() - Date.now()
      const newExpires = new Date(Date.now() + SESSION_TTL_MS)

      if (remaining < RENEW_WITHIN_MS) {
        await sql`
          UPDATE user_sessions
          SET expires_at = ${newExpires.toISOString()}, last_used_at = NOW()
          WHERE id = ${rows[0].id}
        `.catch(() => null)
      } else {
        await sql`
          UPDATE user_sessions SET last_used_at = NOW() WHERE id = ${rows[0].id}
        `.catch(() => null)
      }
    } catch {
      // DB unavailable — fall through and allow (avoids outage-caused logouts)
    }
    return payload
  }

  // Legacy token without jti: rely on JWT's own expiry
  const exp = (payload as unknown as Record<string, unknown>).exp as number | undefined
  if (exp && exp * 1000 < Date.now()) return null

  return payload
}

/** Synchronous verify — no DB check (use for non-sensitive reads). */
export function verifyTokenSync(req: NextRequest): TokenPayload | null {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as TokenPayload
  } catch {
    return null
  }
}

/** Generate a random jti (UUID v4 via Web Crypto, available in Edge + Node). */
export function makeJti(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
