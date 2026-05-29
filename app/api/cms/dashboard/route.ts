import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const [users, jobs, credits, sessions, recentJobs, recentUsers, dailyJobs] = await Promise.all([
    sql`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE)                         AS active,
        COUNT(*) FILTER (WHERE status = 'suspended')                     AS suspended,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS new_today,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')   AS new_week,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')  AS new_month
      FROM users
    ` as Promise<Record<string, unknown>[]>,

    sql`
      SELECT
        COUNT(*)                                                              AS total,
        COUNT(*) FILTER (WHERE status IN ('running','syncing'))               AS running,
        COUNT(*) FILTER (WHERE status = 'success')                            AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')                             AS failed,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')     AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')       AS last_7d
      FROM jobs
    ` as Promise<Record<string, unknown>[]>,

    sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)      AS total_granted,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0), 0) AS total_consumed,
        COALESCE(SUM(amount), 0)                                 AS outstanding
      FROM credits
    `.catch(() => [{}]) as Promise<Record<string, unknown>[]>,

    sql`
      SELECT COUNT(*) AS active
      FROM user_sessions
      WHERE revoked = FALSE AND expires_at > NOW()
    ` as Promise<Record<string, unknown>[]>,

    sql`
      SELECT j.job_number, j.title, j.status, j.created_at, u.email AS user_email
      FROM jobs j LEFT JOIN users u ON u.id = j.user_id
      ORDER BY j.created_at DESC LIMIT 8
    ` as Promise<Record<string, unknown>[]>,

    sql`
      SELECT id, email, name, created_at, status
      FROM users ORDER BY created_at DESC LIMIT 8
    ` as Promise<Record<string, unknown>[]>,

    // Daily job counts for the last 14 days
    sql`
      SELECT
        DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS day,
        COUNT(*) AS count,
        COUNT(*) FILTER (WHERE status = 'success') AS completed,
        COUNT(*) FILTER (WHERE status = 'failed')  AS failed
      FROM jobs
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1
    `.catch(() => []) as Promise<Record<string, unknown>[]>,
  ])

  const u  = users[0] ?? {}
  const j  = jobs[0] ?? {}
  const c  = credits[0] ?? {}
  const s  = sessions[0] ?? {}

  return NextResponse.json({
    users: {
      total:    Number(u.total ?? 0),
      active:   Number(u.active ?? 0),
      suspended: Number(u.suspended ?? 0),
      newToday: Number(u.new_today ?? 0),
      newWeek:  Number(u.new_week ?? 0),
      newMonth: Number(u.new_month ?? 0),
    },
    jobs: {
      total:     Number(j.total ?? 0),
      running:   Number(j.running ?? 0),
      completed: Number(j.completed ?? 0),
      failed:    Number(j.failed ?? 0),
      last24h:   Number(j.last_24h ?? 0),
      last7d:    Number(j.last_7d ?? 0),
    },
    credits: {
      totalGranted:  Number(c.total_granted ?? 0),
      totalConsumed: Number(c.total_consumed ?? 0),
      outstanding:   Number(c.outstanding ?? 0),
    },
    sessions: { active: Number(s.active ?? 0) },
    recentJobs: recentJobs.map(r => ({
      jobNumber: r.job_number,
      title:     r.title,
      status:    r.status,
      createdAt: r.created_at,
      userEmail: r.user_email ?? '',
    })),
    recentUsers: recentUsers.map(r => ({
      id:        String(r.id),
      email:     r.email,
      name:      r.name ?? '',
      createdAt: r.created_at,
      status:    r.status ?? 'active',
    })),
    dailyJobs: dailyJobs.map(r => ({
      day:       r.day,
      count:     Number(r.count),
      completed: Number(r.completed),
      failed:    Number(r.failed),
    })),
  })
}
