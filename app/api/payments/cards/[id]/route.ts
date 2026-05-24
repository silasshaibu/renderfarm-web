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

// ── DELETE /api/payments/cards/[id] ──────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: detach payment method via Stripe API
  return NextResponse.json({ message: 'Payment processor not configured' }, { status: 503 })
}

// ── PATCH /api/payments/cards/[id]/default ────────────────────────────────────
// This is actually called on /api/payments/cards/[id]/default but that sub-path
// also resolves here when the segment is the card id followed by /default.
// If the URL ends with /default, set it as default; otherwise 404.
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  // TODO: set default payment method via Stripe API
  return NextResponse.json({ message: 'Payment processor not configured' }, { status: 503 })
}
