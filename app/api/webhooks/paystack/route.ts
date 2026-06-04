import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { verifyPaystack } from '@/lib/payments'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('x-paystack-signature')

  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY ?? '')
    .update(body)
    .digest('hex')

  if (sig !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const event = JSON.parse(body) as { event: string; data: { reference: string } }

  if (event.event === 'charge.success') {
    try {
      await verifyPaystack(event.data.reference)
    } catch (e) {
      console.error('[paystack-webhook] error:', e)
    }
  }

  return NextResponse.json({ received: true })
}
