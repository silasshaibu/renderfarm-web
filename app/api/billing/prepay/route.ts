import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

const BONUS_MAP: Record<string, number> = { '100': 0, '500': 50, '1000': 150 }

// ── POST /api/billing/prepay ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { amount?: number }
  const amount = Number(body.amount ?? 0)
  if (!amount || amount <= 0) {
    return NextResponse.json({ message: 'Invalid amount' }, { status: 400 })
  }

  const bonus = BONUS_MAP[String(amount)] ?? 0
  const total = amount + bonus

  // Ensure payment_transactions table exists
  await sql`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id     TEXT NOT NULL,
      amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
      bonus_credit NUMERIC(10,2) DEFAULT 0,
      type        TEXT DEFAULT 'prepay',
      status      TEXT DEFAULT 'settled',
      description TEXT DEFAULT '',
      card_type   TEXT DEFAULT 'Card',
      card_number TEXT DEFAULT '****',
      auth_code   TEXT,
      date        TIMESTAMPTZ DEFAULT NOW()
    )
  `

  const rows = await sql`
    INSERT INTO payment_transactions
      (user_id, amount, bonus_credit, type, status, description, date)
    VALUES (
      ${String(user.sub)},
      ${amount},
      ${bonus},
      'prepay',
      'settled',
      ${'Prepay $' + amount + (bonus ? ' (+$' + bonus + ' bonus)' : '')},
      NOW()
    )
    RETURNING id, amount, bonus_credit, date
  ` as Record<string, unknown>[]

  const r = rows[0]
  return NextResponse.json({
    ok:          true,
    id:          r.id,
    amount,
    bonus,
    total,
    date:        r.date,
  }, { status: 201 })
}
