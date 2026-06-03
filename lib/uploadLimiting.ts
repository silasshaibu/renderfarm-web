import { sql, initDB } from '@/lib/db'
import { blockIP } from './middleware/ipBlocklist'

const LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 ** 3,           // 10GB
  MAX_DAILY_NEW_ACCOUNT: 10 * 1024 ** 3,   // 10GB for accounts < 7 days old
  MAX_DAILY_ESTABLISHED: 100 * 1024 ** 3,  // 100GB for accounts >= 7 days old
  MAX_TOTAL_STORAGE: 500 * 1024 ** 3,      // 500GB per account
  MAX_CONCURRENT_UPLOADS: 3,
  NEW_ACCOUNT_AGE_DAYS: 7,
}

export interface UploadLimitCheck {
  allowed: boolean
  reason?: string
  limit?: number
  used?: number
  limit_gb?: number
  used_gb?: number
}

/** Check single file size limit */
export function checkFileSizeLimit(fileSize: number): UploadLimitCheck {
  if (fileSize > LIMITS.MAX_FILE_SIZE) {
    return {
      allowed: false,
      reason: 'file_too_large',
      limit: LIMITS.MAX_FILE_SIZE,
      used: fileSize,
    }
  }
  return { allowed: true }
}

/** Check daily upload quota based on account age */
export async function checkDailyUploadLimit(
  userId: number,
  fileSize: number
): Promise<UploadLimitCheck> {
  try {
    await initDB()

    const userRows = await sql`
      SELECT created_at FROM users WHERE id = ${userId} LIMIT 1
    ` as Record<string, unknown>[]
    if (!userRows.length) {
      return { allowed: false, reason: 'user_not_found' }
    }

    const createdAt = new Date(userRows[0].created_at as string)
    const ageDays = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
    const dailyLimit = ageDays < LIMITS.NEW_ACCOUNT_AGE_DAYS
      ? LIMITS.MAX_DAILY_NEW_ACCOUNT
      : LIMITS.MAX_DAILY_ESTABLISHED

    // Get today's uploads
    const todayRows = await sql`
      SELECT COALESCE(SUM(file_size_bytes), 0) as total
      FROM storage_billing
      WHERE user_id = ${userId}
      AND uploaded_at > NOW() - INTERVAL '24 hours'
    ` as Record<string, unknown>[]
    const todayUploaded = Number(todayRows[0]?.total ?? 0)

    if (todayUploaded + fileSize > dailyLimit) {
      return {
        allowed: false,
        reason: 'daily_upload_limit_exceeded',
        limit: dailyLimit,
        used: todayUploaded,
        limit_gb: dailyLimit / (1024 ** 3),
        used_gb: todayUploaded / (1024 ** 3),
      }
    }

    return { allowed: true }
  } catch (e) {
    console.error('[upload-limit] daily check error:', e)
    return { allowed: false, reason: 'check_failed' }
  }
}

/** Check total storage limit */
export async function checkTotalStorageLimit(
  userId: number,
  fileSize: number
): Promise<UploadLimitCheck> {
  try {
    await initDB()

    const storageRows = await sql`
      SELECT COALESCE(SUM(file_size_bytes), 0) as total
      FROM storage_billing
      WHERE user_id = ${userId} AND is_active = true
    ` as Record<string, unknown>[]
    const totalStorage = Number(storageRows[0]?.total ?? 0)

    if (totalStorage + fileSize > LIMITS.MAX_TOTAL_STORAGE) {
      return {
        allowed: false,
        reason: 'storage_limit_exceeded',
        limit: LIMITS.MAX_TOTAL_STORAGE,
        used: totalStorage,
        limit_gb: LIMITS.MAX_TOTAL_STORAGE / (1024 ** 3),
        used_gb: totalStorage / (1024 ** 3),
      }
    }

    return { allowed: true }
  } catch (e) {
    console.error('[upload-limit] storage check error:', e)
    return { allowed: false, reason: 'check_failed' }
  }
}

/** Check concurrent uploads */
export async function checkConcurrentUploads(userId: number): Promise<UploadLimitCheck> {
  try {
    await initDB()

    const activeRows = await sql`
      SELECT COUNT(*) as cnt
      FROM storage_billing
      WHERE user_id = ${userId}
      AND uploaded_at > NOW() - INTERVAL '1 hour'
      AND is_active = true
      GROUP BY user_id
    ` as Record<string, unknown>[]
    const activeCount = Number(activeRows[0]?.cnt ?? 0)

    if (activeCount >= LIMITS.MAX_CONCURRENT_UPLOADS) {
      return {
        allowed: false,
        reason: 'too_many_concurrent_uploads',
        limit: LIMITS.MAX_CONCURRENT_UPLOADS,
        used: activeCount,
      }
    }

    return { allowed: true }
  } catch (e) {
    console.error('[upload-limit] concurrent check error:', e)
    return { allowed: false, reason: 'check_failed' }
  }
}

/** Detect rapid uploads and block IP if threshold exceeded */
export async function detectRapidUpload(
  userId: number,
  ip: string,
  fileSize: number
): Promise<void> {
  try {
    await initDB()

    // Get uploads from this IP in last 10 minutes
    const rapidRows = await sql`
      SELECT COALESCE(SUM(file_size_bytes), 0) as total
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE (u.registration_ip = ${ip} OR sb.user_id IN (
        SELECT id FROM users WHERE registration_ip = ${ip}
      ))
      AND sb.uploaded_at > NOW() - INTERVAL '10 minutes'
    ` as Record<string, unknown>[]
    const rapidTotal = Number(rapidRows[0]?.total ?? 0)

    // If > 5GB in 10 minutes from this IP, slow it down (24h block)
    if (rapidTotal + fileSize > 5 * 1024 ** 3) {
      await blockIP(ip, 'rapid_upload_detected', 24)
    }
  } catch (e) {
    console.error('[upload-limit] rapid upload detection error:', e)
  }
}

/** Detect same files from different accounts (content duplication attack) */
export async function detectDuplicateContent(md5Hash: string, ip: string): Promise<boolean> {
  try {
    await initDB()

    const dupRows = await sql`
      SELECT COUNT(DISTINCT sb.user_id) as user_count
      FROM storage_billing sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.md5_hash = ${md5Hash}
      AND u.registration_ip = ${ip}
    ` as Record<string, unknown>[]
    const userCount = Number(dupRows[0]?.user_count ?? 0)

    // If same file from 2+ accounts on same IP, flag it
    if (userCount >= 2) {
      await blockIP(ip, 'duplicate_content_multiple_accounts', 7 * 24) // 7 days
      return true
    }

    return false
  } catch (e) {
    console.error('[upload-limit] duplicate detection error:', e)
    return false
  }
}
