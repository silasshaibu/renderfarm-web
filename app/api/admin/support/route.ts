import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

function ticketNum(id: number) { return `RF-SUPPORT-${String(id).padStart(4, '0')}` }

// GET /api/admin/support — all tickets + summary stats for the admin panel
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const rows = await sql`
    SELECT t.*, u.email AS user_email_join
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
    LIMIT 500
  ` as Record<string, unknown>[]

  // Stats
  const open         = rows.filter(r => r.status === 'open').length
  const highCritical = rows.filter(r => (r.priority === 'high' || r.priority === 'critical') && r.status !== 'resolved' && r.status !== 'closed').length
  const resolvedThisWeek = rows.filter(r => {
    if (r.status !== 'resolved' && r.status !== 'closed') return false
    const resolved = r.resolved_at ? new Date(r.resolved_at as string) : null
    if (!resolved) return false
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    return resolved >= weekAgo
  }).length

  // Avg response time (hours between created_at and first support reply timestamp)
  // Approximate: use updated_at as proxy when status != 'open'
  const responded = rows.filter(r => r.status !== 'open' && r.updated_at && r.created_at)
  const avgHours = responded.length === 0 ? null : Math.round(
    responded.reduce((acc, r) => {
      const ms = new Date(r.updated_at as string).getTime() - new Date(r.created_at as string).getTime()
      return acc + ms / 3600000
    }, 0) / responded.length
  )

  return NextResponse.json({
    stats: { open, highCritical, avgResponseHours: avgHours, resolvedThisWeek },
    tickets: rows.map(r => {
      const id = Number(r.id)
      return {
        id,
        ticketNumber: ticketNum(id),
        email:       (r.user_email_join as string) || (r.email as string),
        subject:     r.subject,
        category:    r.category,
        priority:    r.priority,
        status:      r.status,
        jobId:       (r.job_id as string) || '',
        createdAt:   r.created_at,
        updatedAt:   r.updated_at,
      }
    }),
  })
}
