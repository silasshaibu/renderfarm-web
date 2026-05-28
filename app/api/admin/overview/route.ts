import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureCreditSchema } from '@/lib/credits'

export async function GET(req: NextRequest) {
  const admin = await verifyToken(req)
  if (!admin || !admin.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()
  await ensureCreditSchema().catch(() => null)

  const [
    userStats,
    jobStats,
    sessionStats,
    creditStats,
    recentJobs,
    recentUsers,
    storageStats,
  ] = await Promise.all([
    // User counts by status
    sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE AND (invited = FALSE OR invited IS NULL) AND (status IS NULL OR status = 'active')) AS active,
        COUNT(*) FILTER (WHERE invited = TRUE)               AS pending,
        COUNT(*) FILTER (WHERE status = 'suspended')         AS suspended,
        COUNT(*) FILTER (WHERE is_admin = TRUE)              AS admins,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_this_week
      FROM users
    ` as Promise<Record<string, unknown>[]>,

    // Job counts
    sql`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(*) FILTER (WHERE status IN ('running','syncing'))     AS running,
        COUNT(*) FILTER (WHERE status = 'success')                  AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')                   AS failed,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')   AS last_7d
      FROM jobs
    ` as Promise<Record<string, unknown>[]>,

    // Active sessions
    sql`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE source = 'dashboard' OR source IS NULL)       AS dashboard,
        COUNT(*) FILTER (WHERE source = 'addon')                             AS addon
      FROM user_sessions
      WHERE revoked = FALSE AND expires_at > NOW()
    ` as Promise<Record<string, unknown>[]>,

    // Credits summary
    sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)  AS total_issued,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0), 0) AS total_consumed,
        COALESCE(SUM(amount), 0)                             AS outstanding
      FROM credits
    ` as Promise<Record<string, unknown>[]>,

    // 5 most recent jobs
    sql`
      SELECT j.job_number, j.title, j.status, j.created_at, u.email AS user_email
      FROM jobs j
      LEFT JOIN users u ON u.id = j.user_id
      ORDER BY j.created_at DESC LIMIT 5
    ` as Promise<Record<string, unknown>[]>,

    // 5 most recent users
    sql`
      SELECT id, email, name, created_at, status
      FROM users
      ORDER BY created_at DESC LIMIT 5
    ` as Promise<Record<string, unknown>[]>,

    // Storage
    sql`
      SELECT COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS total_bytes
      FROM assets
    ` as Promise<Record<string, unknown>[]>,
  ]).catch(err => {
    console.error('Overview query error:', err)
    return [[], [], [], [], [], [], []]
  })

  const u = (userStats as Record<string, unknown>[])[0] ?? {}
  const j = (jobStats  as Record<string, unknown>[])[0] ?? {}
  const s = (sessionStats as Record<string, unknown>[])[0] ?? {}
  const c = (creditStats as Record<string, unknown>[])[0] ?? {}
  const st = (storageStats as Record<string, unknown>[])[0] ?? {}

  return NextResponse.json({
    users: {
      total:       Number(u.total       ?? 0),
      active:      Number(u.active      ?? 0),
      pending:     Number(u.pending     ?? 0),
      suspended:   Number(u.suspended   ?? 0),
      admins:      Number(u.admins      ?? 0),
      newThisWeek: Number(u.new_this_week ?? 0),
    },
    jobs: {
      total:     Number(j.total     ?? 0),
      running:   Number(j.running   ?? 0),
      completed: Number(j.completed ?? 0),
      failed:    Number(j.failed    ?? 0),
      last24h:   Number(j.last_24h  ?? 0),
      last7d:    Number(j.last_7d   ?? 0),
    },
    sessions: {
      total:     Number(s.total     ?? 0),
      dashboard: Number(s.dashboard ?? 0),
      addon:     Number(s.addon     ?? 0),
    },
    credits: {
      totalIssued:   Number(c.total_issued   ?? 0),
      totalConsumed: Number(c.total_consumed ?? 0),
      outstanding:   Number(c.outstanding    ?? 0),
    },
    storage: {
      fileCount:  Number(st.file_count   ?? 0),
      totalBytes: Number(st.total_bytes  ?? 0),
    },
    recentJobs:  (recentJobs as Record<string, unknown>[]).map(r => ({
      jobNumber:  r.job_number,
      title:      r.title,
      status:     r.status,
      createdAt:  r.created_at,
      userEmail:  r.user_email ?? '',
    })),
    recentUsers: (recentUsers as Record<string, unknown>[]).map(r => ({
      id:        String(r.id),
      email:     r.email,
      name:      r.name ?? '',
      createdAt: r.created_at,
      status:    r.status ?? 'active',
    })),
  })
}
