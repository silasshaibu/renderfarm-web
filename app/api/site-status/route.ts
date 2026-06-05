import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getSiteSettings } from '@/lib/siteSettings'

// GET /api/site-status — lightweight flags any authenticated user can read
// (used by the app shell to decide maintenance gate + by referral UI).
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const s = await getSiteSettings()
  return NextResponse.json({
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
    referralProgramEnabled: s.referralProgramEnabled,
  })
}
