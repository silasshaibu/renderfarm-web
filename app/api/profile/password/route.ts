import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

// POST /api/profile/password
// Body: { currentPassword: string, newPassword: string }
// Authenticated — requires valid JWT.
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { currentPassword?: string; newPassword?: string }
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ message: 'currentPassword and newPassword are required' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ message: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.sub} LIMIT 1`
  if (!rows.length) return NextResponse.json({ message: 'User not found' }, { status: 404 })

  const stored = (rows[0] as { password_hash: string }).password_hash
  const valid  = await bcrypt.compare(currentPassword, stored)
  if (!valid) {
    return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 })
  }

  const hash = await bcrypt.hash(newPassword, 12)
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.sub}`

  return NextResponse.json({ ok: true })
}
