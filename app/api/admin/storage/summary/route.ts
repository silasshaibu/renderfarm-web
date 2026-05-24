import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try { return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean } }
  catch { return null }
}

// GET /api/admin/storage/summary
// Returns asset storage summary from the assets table
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rows = await sql`
    SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_bytes
    FROM assets
  `
  const r          = rows[0] as Record<string, unknown>
  const totalBytes = Number(r.total_bytes ?? 0)
  const fileCount  = Number(r.file_count  ?? 0)

  return NextResponse.json({
    fileCount,
    totalBytes,
    totalGb:   Number((totalBytes / (1024 ** 3)).toFixed(3)),
    totalMb:   Number((totalBytes / (1024 ** 2)).toFixed(1)),
  })
}
