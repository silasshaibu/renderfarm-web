import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'



// ── GET /api/payments/cards ───────────────────────────────────────────────────
// Returns saved payment methods.
// Stub: returns an empty list until a payment processor (Stripe) is wired in.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: query Stripe customer payment methods when billing is enabled
  return NextResponse.json([])
}

// ── POST /api/payments/cards ──────────────────────────────────────────────────
// Add a new payment method (stub).
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: attach payment method via Stripe API
  return NextResponse.json({ message: 'Payment processor not configured' }, { status: 503 })
}
