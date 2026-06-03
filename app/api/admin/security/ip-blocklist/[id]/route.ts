import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const id = parseInt(params.id, 10)
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    // Soft delete: set expires_at to now
    await sql`
      UPDATE ip_blocklist
      SET expires_at = NOW()
      WHERE id = ${id}
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ip-blocklist] DELETE error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
