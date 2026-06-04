import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { chargeAndCredit, getBonus } from '@/lib/payments'

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { amount?: number; paymentMethodId?: string }
  const amount = Number(body.amount ?? 0)
  if (!amount || ![100, 500, 1000].includes(amount)) {
    return NextResponse.json({ message: 'Invalid amount. Must be 100, 500, or 1000.' }, { status: 400 })
  }

  try {
    const result = await chargeAndCredit(user.sub, amount, body.paymentMethodId)
    return NextResponse.json({ ...result, bonus: getBonus(amount), total: amount + getBonus(amount) }, { status: 201 })
  } catch (e) {
    const msg = String(e)
    const status = msg.includes('No payment method') ? 402 : 500
    return NextResponse.json({ message: msg }, { status })
  }
}
