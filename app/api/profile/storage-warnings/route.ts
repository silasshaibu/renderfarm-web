import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getStorageWarnings } from '@/lib/storageNotifications'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const warnings = await getStorageWarnings(user.sub)
  return NextResponse.json({ warnings })
}
