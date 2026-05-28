import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { sendEmail, userInviteEmail, baseUrl } from '@/lib/email'
import { ensureCreditSchema } from '@/lib/credits'

function rowToUser(r: Record<string, unknown>, creditBalance?: number, abuseCount?: number, jobCount?: number) {
  const isActive  = r.is_active != null ? Boolean(r.is_active) : true
  const isInvited = Boolean(r.invited)
  const suspended = (r.status as string) === 'suspended'
  const status    = suspended ? 'suspended' : isInvited && isActive ? 'pending' : isActive ? 'active' : 'inactive'
  return {
    id:                String(r.id),
    email:             r.email as string,
    name:              (r.name as string | undefined) ?? (r.email as string).split('@')[0],
    isAdmin:           Boolean(r.is_admin),
    isActive,
    status,
    suspensionReason:  (r.suspension_reason as string | undefined) ?? null,
    createdAt:         r.created_at as string | undefined,
    creditBalance:     creditBalance ?? 0,
    abuseSignals:      abuseCount ?? 0,
    jobCount:          jobCount ?? 0,
    lastActive:        r.last_active as string | undefined,
  }
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// Returns all users. Admin-only.
// Query params: filter=<email substring>, status=active|inactive|pending
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureCreditSchema().catch(() => null)

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN DEFAULT FALSE`

  const filter = req.nextUrl.searchParams.get('filter') ?? ''
  const status = req.nextUrl.searchParams.get('status') ?? ''

  let rows: Record<string, unknown>[]

  if (status === 'pending') {
    rows = await sql`
      SELECT * FROM users
      WHERE invited = TRUE AND (is_active = TRUE OR is_active IS NULL)
        AND (${filter} = '' OR email ILIKE ${'%' + filter + '%'})
      ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (status === 'active') {
    rows = await sql`
      SELECT * FROM users
      WHERE (is_active = TRUE OR is_active IS NULL) AND (invited = FALSE OR invited IS NULL)
        AND (${filter} = '' OR email ILIKE ${'%' + filter + '%'})
      ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (status === 'inactive') {
    rows = await sql`
      SELECT * FROM users
      WHERE is_active = FALSE
        AND (${filter} = '' OR email ILIKE ${'%' + filter + '%'})
      ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else if (filter) {
    rows = await sql`
      SELECT * FROM users WHERE email ILIKE ${'%' + filter + '%'} ORDER BY id ASC
    ` as Record<string, unknown>[]
  } else {
    rows = await sql`SELECT * FROM users ORDER BY id ASC` as Record<string, unknown>[]
  }

  // Enrich with credit balances, abuse signal counts, job counts
  const [creditRows, abuseRows, jobRows] = await Promise.all([
    sql`SELECT user_id, SUM(amount) AS balance FROM credits GROUP BY user_id` as Promise<Record<string, unknown>[]>,
    sql`SELECT user_id, COUNT(*) AS cnt FROM abuse_signals WHERE reviewed = FALSE GROUP BY user_id` as Promise<Record<string, unknown>[]>,
    sql`SELECT user_id, COUNT(*) AS cnt FROM jobs GROUP BY user_id` as Promise<Record<string, unknown>[]>,
  ]).catch(() => [[] as Record<string, unknown>[], [] as Record<string, unknown>[], [] as Record<string, unknown>[]])

  const creditMap: Record<string, number>  = {}
  const abuseMap:  Record<string, number>  = {}
  const jobMap:    Record<string, number>  = {}
  for (const r of creditRows) creditMap[String(r.user_id)] = Number(r.balance)
  for (const r of abuseRows)  abuseMap[String(r.user_id)]  = Number(r.cnt)
  for (const r of jobRows)    jobMap[String(r.user_id)]    = Number(r.cnt)

  return NextResponse.json(rows.map(r =>
    rowToUser(r, creditMap[String(r.id)], abuseMap[String(r.id)], jobMap[String(r.id)])
  ))
}

// ── POST /api/admin/users ─────────────────────────────────────────────────────
// Admin invites a new user.
export async function POST(req: NextRequest) {
  const caller = await verifyToken(req)
  if (!caller || !caller.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT DEFAULT ''`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN DEFAULT FALSE`

  const body = await req.json() as { email?: string; is_admin?: boolean }
  const email    = (body.email ?? '').toLowerCase().trim()
  const isAdmin  = Boolean(body.is_admin)

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email || !emailRe.test(email)) {
    return NextResponse.json({ message: 'Invalid email address' }, { status: 400 })
  }

  const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
  if (existing.length > 0) {
    return NextResponse.json({ message: 'User already exists' }, { status: 409 })
  }

  const bcrypt = await import('bcryptjs')
  const tempHash = await bcrypt.default.hash('TempPass1!' + Math.random().toString(36), 10)

  const rows = await sql`
    INSERT INTO users (email, password_hash, is_admin, is_active, invited, name)
    VALUES (${email}, ${tempHash}, ${isAdmin}, TRUE, TRUE, ${email.split('@')[0]})
    RETURNING id, email, is_admin, is_active, invited
  ` as Record<string, unknown>[]

  const r      = rows[0]
  const userId = Number(r.id)

  // Generate a set-password token valid for 24 hours (reuses password_resets table)
  await sql`
    CREATE TABLE IF NOT EXISTS password_resets (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      email      TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  // Invalidate any prior tokens for this user
  await sql`DELETE FROM password_resets WHERE user_id = ${userId} AND used = FALSE`

  const token     = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  await sql`
    INSERT INTO password_resets (token, user_id, email, expires_at)
    VALUES (${token}, ${userId}, ${email}, ${expiresAt.toISOString()})
  `

  const setPasswordUrl = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`
  const inviterEmail   = caller.email ?? 'a Renderfarm admin'

  // Fire-and-forget — never block the response on email delivery
  sendEmail({
    to:      email,
    subject: `You've been invited to Renderfarm`,
    html:    userInviteEmail({ email, invitedBy: inviterEmail, setPasswordUrl }),
  }).catch(() => null)

  return NextResponse.json({
    id:      String(r.id),
    email:   r.email   as string,
    isAdmin: Boolean(r.is_admin),
    isActive: true,
    status:  'pending',
  }, { status: 201 })
}
