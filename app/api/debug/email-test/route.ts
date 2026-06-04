import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sendEmailDiagnostic } from '@/lib/email'

// GET /api/debug/email-test — super-admin only.
// Sends a test email to the logged-in user and returns the raw Resend result.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const result = await sendEmailDiagnostic(user.email)
  return NextResponse.json({ to: user.email, ...result })
}
