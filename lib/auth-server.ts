/**
 * Server-side auth helpers shared by all API routes.
 *
 * Keeps JWT_SECRET in one place and adds jti-based revocation:
 *   - Every token issued by login/register carries a unique `jti` (UUID).
 *   - Deleting a session adds its jti to the `token_blocklist` table.
 *   - verifyToken rejects any token whose jti is in the blocklist.
 */
import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql } from './db'

export const JWT_SECRET =
  process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

export interface TokenPayload {
  sub:     string
  email:   string
  isAdmin: boolean
  jti?:    string
}

/** Verify the Bearer token and check the revocation blocklist. */
export async function verifyToken(req: NextRequest): Promise<TokenPayload | null> {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  let payload: TokenPayload
  try {
    payload = jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }

  // Blocklist check — skip for tokens that pre-date jti support
  if (payload.jti) {
    try {
      const rows = await sql`
        SELECT 1 FROM token_blocklist WHERE jti = ${payload.jti} LIMIT 1
      `
      if (rows.length > 0) return null   // revoked
    } catch {
      // If the table doesn't exist yet, allow the token (initDB hasn't run)
    }
  }

  return payload
}

/** Synchronous verify — no blocklist check (use for non-sensitive reads). */
export function verifyTokenSync(req: NextRequest): TokenPayload | null {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload
  } catch {
    return null
  }
}

/** Generate a random jti (UUID v4 via Web Crypto, available in Edge + Node). */
export function makeJti(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older Node builds
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
