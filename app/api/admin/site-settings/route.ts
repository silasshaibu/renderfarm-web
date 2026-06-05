import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getSiteSettings, setSiteSettings, type SiteSettings } from '@/lib/siteSettings'
import { listReviewReferrals, approveReviewReferral } from '@/lib/referrals'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const settings = await getSiteSettings()
  const reviewReferrals = await listReviewReferrals().catch(() => [])
  return NextResponse.json({ ...settings, reviewReferrals })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body = await req.json() as Partial<SiteSettings>
  await setSiteSettings(body)
  return NextResponse.json({ ok: true })
}

// POST — super-admin actions (e.g. approve a held-for-review referral)
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { action, referralId } = await req.json() as { action: string; referralId?: number }
  if (action === 'approveReferral' && referralId) {
    const ok = await approveReviewReferral(Number(referralId))
    return NextResponse.json({ ok })
  }
  return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
}
