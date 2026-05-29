import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest } from '@/lib/cms-auth'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ id: admin.id, email: admin.email })
}
