import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { requiresCardToContinue, FREE_USAGE_WITHOUT_CARD } from '@/lib/billing'

// GET /api/profile/card-status
// Tells the dashboard whether the user must add a card to keep rendering.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  try {
    const gate = await requiresCardToContinue(Number(user.sub))
    const remaining = Math.max(0, FREE_USAGE_WITHOUT_CARD - gate.usageConsumed)
    return NextResponse.json({
      hasCard: gate.hasCard,
      usageConsumed: Math.round(gate.usageConsumed * 100) / 100,
      freeLimit: gate.freeLimit,
      freeRemaining: Math.round(remaining * 100) / 100,
      cardRequired: gate.required,
      // warn when within $2 of the cap and still cardless
      approaching: !gate.hasCard && !gate.required && remaining <= 2,
    })
  } catch (e) {
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
