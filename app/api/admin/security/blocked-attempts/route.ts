import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const rows = await sql`
    SELECT id, ip_address, attempted_at, endpoint, user_agent
    FROM blocked_attempts
    ORDER BY attempted_at DESC
    LIMIT 500
  ` as Record<string, unknown>[]

  return NextResponse.json(rows)
}
