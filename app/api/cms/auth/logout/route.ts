import { NextRequest, NextResponse } from 'next/server'
import { getCmsTokenFromRequest, deleteCmsSession, cmsAudit, verifyCmsRequest, CMS_COOKIE } from '@/lib/cms-auth'

export async function POST(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  const token = getCmsTokenFromRequest(req)
  if (token) {
    await deleteCmsSession(token).catch(() => null)
    if (admin) {
      await cmsAudit({
        actorId: admin.id, actorEmail: admin.email,
        action: 'logout', severity: 'info',
      })
    }
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(CMS_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' })
  return res
}
