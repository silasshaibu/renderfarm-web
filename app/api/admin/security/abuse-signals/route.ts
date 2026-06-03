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
    SELECT id, user_id, ip_address, signal_type, severity, details, created_at
    FROM abuse_signals
    ORDER BY created_at DESC
    LIMIT 500
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(row => ({
    ...row,
    details: typeof row.details === 'string' ? JSON.parse(row.details as string) : row.details,
  })))
}
