import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { removePaymentMethod, setDefaultPaymentMethod } from '@/lib/billing'

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  try {
    await removePaymentMethod(Number(user.sub), parseInt(id, 10))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  try {
    await setDefaultPaymentMethod(Number(user.sub), parseInt(id, 10))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ message: String(e) }, { status: 500 })
  }
}
