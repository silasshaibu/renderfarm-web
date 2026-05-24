import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean } }
  catch { return null }
}

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS cost_limits (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      entity     TEXT NOT NULL,
      limit_type TEXT NOT NULL DEFAULT 'Job',
      limit_usd  NUMERIC(10,4) NOT NULL DEFAULT 0,
      units      TEXT NOT NULL DEFAULT 'Dollars',
      action     TEXT NOT NULL DEFAULT 'Send Email',
      start_date TEXT DEFAULT '',
      end_date   TEXT DEFAULT '',
      recurring  BOOLEAN DEFAULT FALSE,
      spent      NUMERIC(10,4) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

// ── GET /api/admin/limits ─────────────────────────────────────────────────────
// Returns all cost limits.
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureTable()

  const rows = await sql`SELECT * FROM cost_limits ORDER BY created_at DESC`
  const limits = (rows as Record<string, unknown>[]).map((r) => ({
    id:        r.id,
    entity:    r.entity,
    limitType: r.limit_type,
    limit:     String(r.limit_usd),
    units:     r.units,
    action:    r.action,
    startDate: r.start_date,
    endDate:   r.end_date,
    recurring: r.recurring,
    spent:     parseFloat(String(r.spent ?? 0)),
  }))

  return NextResponse.json(limits)
}

// ── POST /api/admin/limits ────────────────────────────────────────────────────
// Create a new cost limit.
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureTable()

  const body = await req.json() as {
    entity?:    string
    limitType?: string
    limit?:     string | number
    units?:     string
    action?:    string
    startDate?: string
    endDate?:   string
    recurring?: boolean
  }

  const rows = await sql`
    INSERT INTO cost_limits
      (entity, limit_type, limit_usd, units, action, start_date, end_date, recurring)
    VALUES (
      ${body.entity     ?? 'Unnamed'},
      ${body.limitType  ?? 'Job'},
      ${parseFloat(String(body.limit ?? 0))},
      ${body.units      ?? 'Dollars'},
      ${body.action     ?? 'Send Email'},
      ${body.startDate  ?? ''},
      ${body.endDate    ?? ''},
      ${body.recurring  ?? false}
    )
    RETURNING *
  ` as Record<string, unknown>[]

  const r = rows[0]
  return NextResponse.json({
    id:        r.id,
    entity:    r.entity,
    limitType: r.limit_type,
    limit:     String(r.limit_usd),
    units:     r.units,
    action:    r.action,
    startDate: r.start_date,
    endDate:   r.end_date,
    recurring: r.recurring,
    spent:     0,
  }, { status: 201 })
}
