import { NextRequest, NextResponse } from 'next/server'
import { verifyPaystack } from '@/lib/payments'

export async function GET(req: NextRequest) {
  const reference = req.nextUrl.searchParams.get('reference')
  if (!reference) {
    return NextResponse.redirect(new URL('/admin?tab=payment&status=failed', req.url))
  }

  try {
    await verifyPaystack(reference)
    return NextResponse.redirect(new URL('/admin?tab=payment&status=success', req.url))
  } catch (e) {
    console.error('[paystack/callback] error:', e)
    return NextResponse.redirect(new URL('/admin?tab=payment&status=failed', req.url))
  }
}
