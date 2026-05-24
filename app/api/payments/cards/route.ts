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

// ── GET /api/payments/cards ───────────────────────────────────────────────────
// Returns saved payment methods.
// Stub: returns an empty list until a payment processor (Stripe) is wired in.
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: query Stripe customer payment methods when billing is enabled
  return NextResponse.json([])
}
