import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { addCredit, getBalance, checkOverdraftStatus, ensureCreditSchema, STORAGE_PRICE_PER_GB_MONTH } from '@/lib/credits'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()
  await ensureCreditSchema().catch(() => null)

  try {
    // Get all active storage files grouped by user
    const filesByUser = await sql`
      SELECT
        user_id,
        COUNT(*) as file_count,
        SUM(file_size_bytes) as total_bytes
      FROM storage_billing
      WHERE is_active = true AND purged_at IS NULL
      GROUP BY user_id
    ` as Record<string, unknown>[]

    let billed = 0
    let overdrafts = 0

    for (const row of filesByUser) {
      const userId = Number(row.user_id)
      const totalBytes = Number(row.total_bytes ?? 0)
      const totalGB = totalBytes / (1024 ** 3)

      // Daily cost = GB × ($0.10/month / 30 days)
      const dailyCost = totalGB * (STORAGE_PRICE_PER_GB_MONTH / 30)

      if (dailyCost < 0.0001) continue // skip negligible amounts

      // Deduct from credits
      await addCredit({
        userId,
        amount: -dailyCost,
        type: 'usage',
        description: `Storage: ${totalGB.toFixed(3)} GB × $${STORAGE_PRICE_PER_GB_MONTH}/GB/month (daily)`,
      })

      // Mark files as billed
      await sql`
        UPDATE storage_billing
        SET last_billed_at = NOW(),
            total_billed = total_billed + ${dailyCost}
        WHERE user_id = ${userId} AND is_active = true
      `.catch(() => null)

      // Check if this pushed user into overdraft
      const newBalance = await getBalance(userId)
      void checkOverdraftStatus(userId, newBalance)

      billed++

      // Detect new overdraft
      const userRow = await sql`
        SELECT overdraft_limit, debt_hold_since FROM users WHERE id = ${userId} LIMIT 1
      ` as Record<string, unknown>[]
      const limit = Number(userRow[0]?.overdraft_limit ?? -5)
      if (newBalance <= limit && !userRow[0]?.debt_hold_since) {
        overdrafts++
      }
    }

    // Auto-purge: files not accessed (last_visited_at) in 20 days
    const cutoffDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
    const toPurge = await sql`
      SELECT sb.*, u.email
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.is_active = true
      AND sb.uploaded_at < $1
      AND (u.last_visited_at IS NULL OR u.last_visited_at < $1)
      LIMIT 1000
    ` as Record<string, unknown>[]

    let purged = 0
    for (const file of toPurge) {
      // Mark as purged
      await sql`
        UPDATE storage_billing
        SET is_active = false, purged_at = NOW()
        WHERE id = ${file.id}
      `.catch(() => null)

      // Mark job_files as not existing
      await sql`
        UPDATE job_files
        SET still_exists = false
        WHERE md5_hash = ${file.md5_hash}
      `.catch(() => null)

      purged++
    }

    // Warn users about upcoming purge (13 days old = 7 days to go)
    const warnDate = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000)
    const toWarn = await sql`
      SELECT DISTINCT sb.user_id, u.email
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.is_active = true
      AND sb.uploaded_at < $1
      AND sb.uploaded_at > $2
      AND (u.last_visited_at IS NULL OR u.last_visited_at < $3)
    ` as Record<string, unknown>[]

    // TODO: send warning emails (implement in notifications.ts)

    console.log(`[storage-billing] Billed ${billed} users, ${purged} files purged, ${toWarn.length} warned, ${overdrafts} new overdrafts`)

    return NextResponse.json({
      ok: true,
      billed,
      purged,
      warned: toWarn.length,
      overdrafts,
    })
  } catch (e) {
    console.error('[storage-billing] Error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
