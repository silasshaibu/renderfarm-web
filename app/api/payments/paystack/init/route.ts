import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { initPaystack } from '@/lib/payments'
import { sql, initDB } from '@/lib/db'

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { amount?: number }
  const amount = Number(body.amount ?? 0)
  if (!amount || ![100, 500, 1000].includes(amount)) {
    return NextResponse.json({ message: 'Invalid amount. Must be 100, 500, or 1000.' }, { status: 400 })
  }

  await initDB()
  const userRows = await sql`SELECT email FROM users WHERE id = ${user.sub} LIMIT 1` as Record<string, unknown>[]
  const email = userRows[0]?.email as string

  try {
    const result = await initPaystack(user.sub, amount, email)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[paystack/init] error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
