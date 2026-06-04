import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { savePaymentMethod } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { paymentMethodId } = await req.json() as { paymentMethodId: string }
  if (!paymentMethodId) {
    return NextResponse.json({ message: 'Missing paymentMethodId' }, { status: 400 })
  }

  try {
    await savePaymentMethod(Number(user.sub), paymentMethodId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[cards/save] error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
