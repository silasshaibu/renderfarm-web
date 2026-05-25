import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



// GET /api/admin/storage/summary
// Returns asset storage summary from the assets table
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
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
