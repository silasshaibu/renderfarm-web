import { NextRequest, NextResponse } from 'next/server'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { retryDeclinedBilling, checkExpiringCards } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().getDate()

  try {
    let retried = 0
    // Retry on day 3, 7, 14 of the month
    if ([3, 7, 14].includes(today)) {
      const result = await retryDeclinedBilling()
      retried = result.retried
    }

    // Check expiring cards daily
    await checkExpiringCards()

    return NextResponse.json({ ok: true, retried, day: today })
  } catch (e) {
    console.error('[cron/billing-retry] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
