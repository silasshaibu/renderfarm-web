import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getUserTransactions } from '@/lib/billing'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  try {
    const transactions = await getUserTransactions(Number(user.sub))
    return NextResponse.json(transactions)
  } catch (e) {
    console.error('[payments/transactions] error:', e)
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
