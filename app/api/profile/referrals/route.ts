import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getReferralStats } from '@/lib/referrals'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  try {
    const stats = await getReferralStats(Number(user.sub))
    return NextResponse.json(stats)
  } catch (e) {
    console.error('[profile/referrals] error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
