import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

const STORAGE_PRICE_PER_GB_MONTH = 0.10

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  // Get total storage
  const storageRows = await sql`
    SELECT
      COUNT(*) as file_count,
      COALESCE(SUM(file_size_bytes), 0) as total_bytes,
      COALESCE(SUM(total_billed), 0) as total_billed,
      MAX(last_billed_at) as last_billed_at
    FROM storage_billing
    WHERE user_id = ${user.sub} AND is_active = true AND purged_at IS NULL
  ` as Record<string, unknown>[]

  const storage = storageRows[0] ?? {}
  const totalBytes = Number(storage.total_bytes ?? 0)
  const totalGB = totalBytes / (1024 ** 3)
  const fileCount = Number(storage.file_count ?? 0)
  const lastBilledAt = storage.last_billed_at

  // Calculate daily and monthly costs
  const dailyUsage = totalGB * (STORAGE_PRICE_PER_GB_MONTH / 30)
  const monthlyEstimate = totalGB * STORAGE_PRICE_PER_GB_MONTH

  // Get file types
  const typeRows = await sql`
    SELECT
      CASE
        WHEN file_name ~ '\.(blend|obj|fbx|gltf|usdz)$' THEN 'Models'
        WHEN file_name ~ '\.(exr|png|jpg|jpeg|tiff)$' THEN 'Images'
        WHEN file_name ~ '\.(mp4|mov|avi|webm)$' THEN 'Videos'
        ELSE 'Other'
      END as file_type,
      COUNT(*) as count
    FROM storage_billing
    WHERE user_id = ${user.sub} AND is_active = true AND purged_at IS NULL
    GROUP BY file_type
  ` as Record<string, unknown>[]

  const filesByType: Record<string, number> = {}
  for (const row of typeRows) {
    filesByType[row.file_type as string] = Number(row.count ?? 0)
  }

  // Get recent files
  const recentRows = await sql`
    SELECT file_name, file_size_bytes, uploaded_at, still_exists
    FROM storage_billing
    WHERE user_id = ${user.sub} AND is_active = true
    ORDER BY uploaded_at DESC
    LIMIT 50
  ` as Record<string, unknown>[]

  const recentFiles = recentRows.map(row => ({
    name: String(row.file_name ?? 'unknown'),
    size_bytes: Number(row.file_size_bytes ?? 0),
    uploaded_at: String(row.uploaded_at ?? ''),
    still_exists: Boolean(row.still_exists),
  }))

  return NextResponse.json({
    totalBytes,
    totalGB: Math.round(totalGB * 100) / 100,
    fileCount,
    monthlyEstimate,
    dailyUsage: Math.round(dailyUsage * 1000) / 1000,
    lastBilledAt,
    filesByType,
    recentFiles,
  })
}
