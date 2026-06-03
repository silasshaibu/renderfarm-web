import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureNotificationSchema } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureNotificationSchema()

  const rows = await sql`
    SELECT notify_email, notify_job_completed, notify_job_failed, notify_weekly_report, notify_on
    FROM users WHERE id = ${user.sub} LIMIT 1
  ` as Record<string, unknown>[]

  const r = rows[0] ?? {}
  return NextResponse.json({
    notifyEmail:        r.notify_email         !== false,
    notifyJobCompleted: r.notify_job_completed !== false,
    notifyJobFailed:    r.notify_job_failed    !== false,
    notifyWeeklyReport: Boolean(r.notify_weekly_report),
    notifyOn:           String(r.notify_on ?? 'BOTH'),
  })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    notifyEmail?:        boolean
    notifyJobCompleted?: boolean
    notifyJobFailed?:    boolean
    notifyWeeklyReport?: boolean
    notifyOn?:           string
  }

  await initDB()
  await ensureNotificationSchema()

  await sql`
    UPDATE users SET
      notify_email         = ${body.notifyEmail        ?? true},
      notify_job_completed = ${body.notifyJobCompleted ?? true},
      notify_job_failed    = ${body.notifyJobFailed    ?? true},
      notify_weekly_report = ${body.notifyWeeklyReport ?? false},
      notify_on            = ${body.notifyOn           ?? 'BOTH'}
    WHERE id = ${user.sub}
  `

  return NextResponse.json({ ok: true })
}
