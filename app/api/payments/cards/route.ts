import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { listPaymentMethods, createSetupIntent } from '@/lib/payments'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  try {
    const cards = await listPaymentMethods(user.sub)
    return NextResponse.json(cards)
  } catch (e) {
    console.error('[payments/cards] GET error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  try {
    const result = await createSetupIntent(user.sub)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[payments/cards] POST error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
