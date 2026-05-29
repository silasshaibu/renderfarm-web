/**
 * lib/cms-auth.ts — Super Admin CMS session management.
 * Completely separate from the regular user JWT auth system.
 * Sessions stored as hashed tokens in cms_sessions table.
 * httpOnly cookie: cms_session
 */
import { createHash, randomBytes } from 'crypto'
import { sql, initDB } from './db'
import { sendEmail } from './email'

export const CMS_COOKIE  = 'cms_session'
export const SESSION_TTL = 4 * 60 * 60 * 1000  // 4 hours inactivity

export interface CmsSuperAdmin {
  id:       number
  email:    string
  isActive: boolean
}

// ── Schema ──────────────────────────────────────────────────────────────────

export async function ensureCmsSchema() {
  await initDB()

  await sql`
    CREATE TABLE IF NOT EXISTS superadmins (
      id              SERIAL PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      totp_secret     TEXT DEFAULT NULL,
      backup_codes    JSONB DEFAULT '[]',
      last_login_at   TIMESTAMPTZ DEFAULT NULL,
      last_login_ip   TEXT DEFAULT '',
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cms_sessions (
      id              SERIAL PRIMARY KEY,
      superadmin_id   INTEGER NOT NULL REFERENCES superadmins(id) ON DELETE CASCADE,
      token_hash      TEXT NOT NULL UNIQUE,
      ip_address      TEXT DEFAULT '',
      user_agent      TEXT DEFAULT '',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      expires_at      TIMESTAMPTZ NOT NULL,
      last_used_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS cms_sessions_token_idx ON cms_sessions (token_hash)`

  await sql`
    CREATE TABLE IF NOT EXISTS cms_audit_log (
      id          SERIAL PRIMARY KEY,
      actor_id    INTEGER DEFAULT NULL,
      actor_email TEXT DEFAULT '',
      actor_type  TEXT NOT NULL DEFAULT 'superadmin',
      action      TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id   TEXT DEFAULT '',
      details     JSONB DEFAULT '{}',
      ip_address  TEXT DEFAULT '',
      severity    TEXT NOT NULL DEFAULT 'info',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS announcements (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      message         TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'info',
      audience        TEXT NOT NULL DEFAULT 'all',
      target_user_ids JSONB DEFAULT '[]',
      show_from       TIMESTAMPTZ DEFAULT NOW(),
      show_until      TIMESTAMPTZ DEFAULT NULL,
      dismissible     BOOLEAN DEFAULT TRUE,
      created_by      INTEGER DEFAULT NULL,
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id              SERIAL PRIMARY KEY,
      key             TEXT NOT NULL UNIQUE,
      value           BOOLEAN NOT NULL DEFAULT TRUE,
      description     TEXT DEFAULT '',
      last_changed_by INTEGER DEFAULT NULL,
      last_changed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `

  // Seed default feature flags
  await sql`
    INSERT INTO feature_flags (key, value, description) VALUES
      ('welcome_bonus_enabled',       TRUE,  'Grant $25 credits to new users on signup'),
      ('new_registrations_enabled',   TRUE,  'Allow new users to register'),
      ('job_submission_enabled',      TRUE,  'Allow users to submit new jobs'),
      ('mfa_required_for_all',        FALSE, 'Force all users to set up MFA'),
      ('credit_blocking_enabled',     TRUE,  'Block job submission when credits reach $0'),
      ('calculator_visible',          TRUE,  'Show Calculator in sidebar'),
      ('support_tickets_enabled',     TRUE,  'Enable the support ticket system'),
      ('maintenance_mode',            FALSE, 'Platform maintenance mode — blocks job submissions'),
      ('blog_visible',                TRUE,  'Show /blog to users')
    ON CONFLICT (key) DO NOTHING
  `

  await sql`
    CREATE TABLE IF NOT EXISTS cms_login_attempts (
      id          SERIAL PRIMARY KEY,
      ip_address  TEXT NOT NULL,
      email       TEXT DEFAULT '',
      success     BOOLEAN DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// ── Token helpers ────────────────────────────────────────────────────────────

export function makeToken(): string { return randomBytes(32).toString('hex') }
export function hashToken(t: string): string { return createHash('sha256').update(t).digest('hex') }

// ── Session CRUD ─────────────────────────────────────────────────────────────

export async function createCmsSession(
  superadminId: number,
  ip: string,
  userAgent: string,
): Promise<string> {
  const token   = makeToken()
  const hash    = hashToken(token)
  const expires = new Date(Date.now() + SESSION_TTL)
  await sql`
    INSERT INTO cms_sessions (superadmin_id, token_hash, ip_address, user_agent, expires_at)
    VALUES (${superadminId}, ${hash}, ${ip}, ${userAgent}, ${expires.toISOString()})
  `
  return token
}

export async function verifyCmsSession(token: string | undefined): Promise<CmsSuperAdmin | null> {
  if (!token) return null
  const hash = hashToken(token)
  const now  = new Date()
  const rows = await sql`
    SELECT s.id AS session_id, s.expires_at, s.last_used_at,
           a.id, a.email, a.is_active
    FROM cms_sessions s
    JOIN superadmins a ON a.id = s.superadmin_id
    WHERE s.token_hash = ${hash}
      AND s.expires_at > ${now.toISOString()}
    LIMIT 1
  ` as Record<string, unknown>[]

  if (!rows.length) return null
  const r = rows[0]
  if (!r.is_active) return null

  // Slide the expiry window (inactivity timeout)
  const newExpiry = new Date(Date.now() + SESSION_TTL)
  await sql`
    UPDATE cms_sessions
    SET last_used_at = NOW(), expires_at = ${newExpiry.toISOString()}
    WHERE token_hash = ${hash}
  `

  return { id: Number(r.id), email: String(r.email), isActive: Boolean(r.is_active) }
}

export async function deleteCmsSession(token: string): Promise<void> {
  await sql`DELETE FROM cms_sessions WHERE token_hash = ${hashToken(token)}`
}

// ── Rate limiting for login ──────────────────────────────────────────────────

export async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const window = new Date(Date.now() - 15 * 60 * 1000)
  const rows = await sql`
    SELECT COUNT(*) AS cnt FROM cms_login_attempts
    WHERE ip_address = ${ip} AND success = FALSE AND created_at > ${window.toISOString()}
  ` as Record<string, unknown>[]
  const count = Number(rows[0]?.cnt ?? 0)
  return { allowed: count < 3, remaining: Math.max(0, 3 - count) }
}

export async function recordLoginAttempt(ip: string, email: string, success: boolean) {
  await sql`
    INSERT INTO cms_login_attempts (ip_address, email, success) VALUES (${ip}, ${email}, ${success})
  `
}

// ── Audit logging ────────────────────────────────────────────────────────────

export async function cmsAudit(opts: {
  actorId?: number
  actorEmail?: string
  actorType?: string
  action: string
  targetType?: string
  targetId?: string
  details?: object
  ip?: string
  severity?: 'info' | 'warning' | 'critical'
}) {
  try {
    await sql`
      INSERT INTO cms_audit_log
        (actor_id, actor_email, actor_type, action, target_type, target_id, details, ip_address, severity)
      VALUES (
        ${opts.actorId ?? null},
        ${opts.actorEmail ?? ''},
        ${opts.actorType ?? 'superadmin'},
        ${opts.action},
        ${opts.targetType ?? ''},
        ${opts.targetId ?? ''},
        ${JSON.stringify(opts.details ?? {})},
        ${opts.ip ?? ''},
        ${opts.severity ?? 'info'}
      )
    `

    // Email alert on critical actions
    if (opts.severity === 'critical') {
      const saRows = await sql`SELECT email FROM superadmins WHERE is_active = TRUE LIMIT 1` as Record<string, unknown>[]
      const saEmail = saRows[0]?.email as string | undefined
      if (saEmail) {
        sendEmail({
          to: saEmail,
          subject: `⚠️ Critical CMS action: ${opts.action}`,
          html: `<div style="font-family:sans-serif;padding:20px">
            <h2 style="color:#ef4444">Critical CMS Action Performed</h2>
            <p><strong>Action:</strong> ${opts.action}</p>
            <p><strong>By:</strong> ${opts.actorEmail ?? 'system'}</p>
            <p><strong>Target:</strong> ${opts.targetType} ${opts.targetId}</p>
            <p><strong>Details:</strong> <pre>${JSON.stringify(opts.details, null, 2)}</pre></p>
            <p><strong>IP:</strong> ${opts.ip}</p>
            <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
          </div>`,
        }).catch(() => null)
      }
    }
  } catch { /* never break the request */ }
}

// ── Read cookie helper (for API routes) ─────────────────────────────────────

export function getCmsTokenFromRequest(req: Request): string | undefined {
  const cookie = req.headers.get('cookie') ?? ''
  const match  = cookie.match(new RegExp(`(?:^|; )${CMS_COOKIE}=([^;]+)`))
  return match?.[1]
}

export async function verifyCmsRequest(req: Request): Promise<CmsSuperAdmin | null> {
  const token = getCmsTokenFromRequest(req)
  return verifyCmsSession(token)
}

// ── IP whitelist ─────────────────────────────────────────────────────────────

export function checkIpWhitelist(ip: string): boolean {
  const allowed = process.env.CMS_ALLOWED_IPS
  if (!allowed) return true  // no whitelist configured = allow all
  return allowed.split(',').map(s => s.trim()).includes(ip)
}
