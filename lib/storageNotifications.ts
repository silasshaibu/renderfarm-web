import { sql, initDB } from '@/lib/db'
import { sendEmail } from './email'

const STORAGE_PRICE_PER_GB_MONTH = 0.10
const STORAGE_PURGE_DAYS = 20
const STORAGE_WARN_DAYS_BEFORE = 7

export interface StorageWarning {
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  daysUntilPurge?: number
  estimatedMonthlyCost?: number
  currentBalance?: number
}

/**
 * Detect and send storage warning emails
 */
export async function sendStorageWarnings(): Promise<number> {
  try {
    await initDB()

    let emailsSent = 0

    // Find users with large uploads and no renders in 24h
    const largeNoRenderRows = await sql`
      SELECT DISTINCT sb.user_id, u.email, SUM(sb.file_size_bytes) as total_bytes
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.is_active = true
      AND sb.uploaded_at > NOW() - INTERVAL '24 hours'
      GROUP BY sb.user_id, u.email
      HAVING SUM(sb.file_size_bytes) > 20 * 1024 * 1024 * 1024
      AND NOT EXISTS (
        SELECT 1 FROM jobs j WHERE j.user_id = sb.user_id
        AND j.created_at > NOW() - INTERVAL '24 hours'
      )
    ` as Record<string, unknown>[]

    for (const row of largeNoRenderRows) {
      const email = row.email as string
      const totalGB = (Number(row.total_bytes ?? 0) / (1024 ** 3)).toFixed(2)

      await sendEmail({
        to: email,
        subject: '⚠ Large files uploaded — storage billing active',
        html: `
          <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
            <h2 style="color:#fbbf24;margin-top:0">Large Upload Detected</h2>
            <p style="color:#94a3b8;">You uploaded ${totalGB} GB in the last 24 hours.</p>
            <p style="color:#94a3b8;">Storage billing is now active at <strong>$0.10/GB/month</strong>.</p>
            <p style="color:#94a3b8;">Files will be automatically purged after 20 days of inactivity.</p>
            <p style="color:#94a3b8;"><a href="/usage" style="color:#3b82f6;text-decoration:none;">View storage usage</a></p>
          </div>
        `,
      }).catch(() => null)

      emailsSent++
    }

    // Find users about to hit 90% storage
    const highStorageRows = await sql`
      SELECT DISTINCT u.id, u.email, SUM(sb.file_size_bytes) as total_bytes
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.is_active = true AND sb.purged_at IS NULL
      GROUP BY u.id, u.email
      HAVING SUM(sb.file_size_bytes) > 450 * 1024 * 1024 * 1024
      AND NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.target_user_id = u.id
        AND al.action = 'high_storage_warning'
        AND al.created_at > NOW() - INTERVAL '7 days'
      )
    ` as Record<string, unknown>[]

    for (const row of highStorageRows) {
      const userId = Number(row.id ?? 0)
      const email = row.email as string
      const totalGB = (Number(row.total_bytes ?? 0) / (1024 ** 3)).toFixed(2)

      await sendEmail({
        to: email,
        subject: '🚨 Storage quota 90% full',
        html: `
          <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
            <h2 style="color:#f87171;margin-top:0">Storage Nearly Full</h2>
            <p style="color:#94a3b8;">You're using ${totalGB} GB of 500 GB (90%).</p>
            <p style="color:#94a3b8;">Old files are automatically purged after 20 days of inactivity. Visit the site regularly to prevent purges.</p>
            <p style="color:#94a3b8;"><a href="/usage" style="color:#3b82f6;text-decoration:none;">Manage storage</a></p>
          </div>
        `,
      }).catch(() => null)

      // Log warning
      await sql`
        INSERT INTO audit_log (admin_id, target_user_id, action, details)
        VALUES (0, ${userId}, 'high_storage_warning', '{}')
      `.catch(() => null)

      emailsSent++
    }

    // Find users with files about to be purged
    const purgeWarningRows = await sql`
      SELECT DISTINCT sb.user_id, u.email, COUNT(*) as file_count
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.is_active = true
      AND sb.uploaded_at < NOW() - INTERVAL '13 days'
      AND sb.uploaded_at > NOW() - INTERVAL '14 days'
      AND (u.last_visited_at IS NULL OR u.last_visited_at < NOW() - INTERVAL '13 days')
      AND NOT EXISTS (
        SELECT 1 FROM audit_log al
        WHERE al.target_user_id = u.id
        AND al.action = 'purge_warning_sent'
        AND al.created_at > NOW() - INTERVAL '1 day'
      )
      GROUP BY sb.user_id, u.email
    ` as Record<string, unknown>[]

    for (const row of purgeWarningRows) {
      const userId = Number(row.user_id ?? 0)
      const email = row.email as string
      const fileCount = Number(row.file_count ?? 0)

      await sendEmail({
        to: email,
        subject: '📌 Files will be purged in 7 days',
        html: `
          <div style="font-family:sans-serif;color:#e2e8f0;background:#0f1117;padding:32px;border-radius:8px;max-width:560px;margin:0 auto">
            <h2 style="color:#fbbf24;margin-top:0">Auto-Purge Coming</h2>
            <p style="color:#94a3b8;"><strong>${fileCount} files</strong> will be automatically deleted in 7 days due to inactivity.</p>
            <p style="color:#94a3b8;">To prevent deletion, visit the dashboard to reset the inactivity timer.</p>
            <p style="color:#94a3b8;">The timer resets every time you visit the site.</p>
            <p style="color:#94a3b8;"><a href="/jobs" style="color:#3b82f6;text-decoration:none;">Visit dashboard now</a></p>
          </div>
        `,
      }).catch(() => null)

      // Log warning
      await sql`
        INSERT INTO audit_log (admin_id, target_user_id, action, details)
        VALUES (0, ${userId}, 'purge_warning_sent', '{}')
      `.catch(() => null)

      emailsSent++
    }

    console.log(`[storage-notifications] Sent ${emailsSent} warning emails`)
    return emailsSent
  } catch (e) {
    console.error('[storage-notifications] error:', e)
    return 0
  }
}

/**
 * Check user's storage and return warnings
 */
export async function getStorageWarnings(userId: number): Promise<StorageWarning[]> {
  try {
    await initDB()

    const warnings: StorageWarning[] = []

    // Get user storage
    const storageRows = await sql`
      SELECT
        COALESCE(SUM(file_size_bytes), 0) as total_bytes,
        MAX(uploaded_at) as newest_upload,
        MIN(uploaded_at) as oldest_upload
      FROM storage_billing
      WHERE user_id = ${userId} AND is_active = true AND purged_at IS NULL
    ` as Record<string, unknown>[]

    const totalBytes = Number(storageRows[0]?.total_bytes ?? 0)
    const totalGB = totalBytes / (1024 ** 3)

    // Get user balance
    const creditRows = await sql`
      SELECT COALESCE(SUM(amount), 0) as balance FROM credits WHERE user_id = ${userId}
    ` as Record<string, unknown>[]
    const balance = Number(creditRows[0]?.balance ?? 0)

    const monthlyCost = totalGB * STORAGE_PRICE_PER_GB_MONTH

    // Warning: approaching 100GB
    if (totalGB >= 90 && totalGB < 100) {
      warnings.push({
        type: 'approaching_limit',
        severity: 'warning',
        message: `You're using ${totalGB.toFixed(1)} GB. Free tier limit is 100 GB.`,
        estimatedMonthlyCost: monthlyCost,
      })
    }

    // Critical: at 100GB
    if (totalGB >= 100) {
      warnings.push({
        type: 'at_limit',
        severity: 'critical',
        message: `You've exceeded the 100 GB free tier limit. Storage billing is now active.`,
        estimatedMonthlyCost: monthlyCost,
      })
    }

    // Warning: storage costs exceed balance
    if (balance < monthlyCost && balance >= 0) {
      warnings.push({
        type: 'insufficient_credits',
        severity: 'warning',
        message: `Your monthly storage cost ($${monthlyCost.toFixed(2)}) exceeds your balance ($${balance.toFixed(2)}).`,
        estimatedMonthlyCost: monthlyCost,
        currentBalance: balance,
      })
    }

    // Critical: in overdraft from storage
    if (balance < 0 && totalGB > 0) {
      warnings.push({
        type: 'storage_overdraft',
        severity: 'critical',
        message: `Storage costs have pushed your account into overdraft ($${balance.toFixed(2)}).`,
        estimatedMonthlyCost: monthlyCost,
        currentBalance: balance,
      })
    }

    // Get days until purge for oldest files
    const oldestUploadRows = await sql`
      SELECT uploaded_at FROM storage_billing
      WHERE user_id = ${userId} AND is_active = true AND purged_at IS NULL
      ORDER BY uploaded_at ASC LIMIT 1
    ` as Record<string, unknown>[]

    if (oldestUploadRows.length > 0) {
      const uploadedAt = new Date(oldestUploadRows[0].uploaded_at as string)
      const now = new Date()
      const daysOld = (now.getTime() - uploadedAt.getTime()) / (24 * 60 * 60 * 1000)
      const daysUntilPurge = Math.max(0, STORAGE_PURGE_DAYS - daysOld)

      if (daysUntilPurge <= STORAGE_WARN_DAYS_BEFORE && daysUntilPurge > 0) {
        warnings.push({
          type: 'upcoming_purge',
          severity: 'warning',
          message: `Your oldest files will be automatically purged in ${Math.ceil(daysUntilPurge)} days due to inactivity.`,
          daysUntilPurge: Math.ceil(daysUntilPurge),
        })
      }
    }

    return warnings
  } catch (e) {
    console.error('[storage-warnings] error:', e)
    return []
  }
}
