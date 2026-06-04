import { NextRequest, NextResponse } from 'next/server'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { runMonthlyBilling } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyBilling()
    console.log('[cron/monthly-billing]', result)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron/monthly-billing] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
