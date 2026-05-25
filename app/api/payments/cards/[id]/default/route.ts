import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'



// ── PATCH /api/payments/cards/[id]/default ────────────────────────────────────
// Set a payment method as the default.
// Stub: returns 503 until Stripe is wired in.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: call Stripe API to set default payment method
  void context.params
  return NextResponse.json({ message: 'Payment processor not configured' }, { status: 503 })
}
