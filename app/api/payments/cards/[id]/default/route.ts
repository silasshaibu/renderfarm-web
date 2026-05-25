import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string } }
  catch { return null }
}

// ── PATCH /api/payments/cards/[id]/default ────────────────────────────────────
// Set a payment method as the default.
// Stub: returns 503 until Stripe is wired in.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: call Stripe API to set default payment method
  void context.params
  return NextResponse.json({ message: 'Payment processor not configured' }, { status: 503 })
}
