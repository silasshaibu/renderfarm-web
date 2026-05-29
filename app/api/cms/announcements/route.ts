import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest, cmsAudit } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const rows = await sql`
    SELECT id, title, message, type, audience, target_user_ids, show_from, show_until,
           dismissible, created_by, is_active, created_at
    FROM announcements
    ORDER BY created_at DESC
    LIMIT 100
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:            String(r.id),
    title:         r.title,
    message:       r.message,
    type:          r.type ?? 'info',
    audience:      r.audience ?? 'all',
    targetUserIds: r.target_user_ids ?? [],
    showFrom:      r.show_from,
    showUntil:     r.show_until ?? null,
    dismissible:   Boolean(r.dismissible),
    isActive:      Boolean(r.is_active),
    createdAt:     r.created_at,
  })))
}

export async function POST(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    title: string
    message: string
    type?: string
    audience?: string
    showFrom?: string
    showUntil?: string | null
    dismissible?: boolean
  }

  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  const result = await sql`
    INSERT INTO announcements (title, message, type, audience, show_from, show_until, dismissible, created_by)
    VALUES (
      ${body.title},
      ${body.message},
      ${body.type ?? 'info'},
      ${body.audience ?? 'all'},
      ${body.showFrom ?? new Date().toISOString()},
      ${body.showUntil ?? null},
      ${body.dismissible !== false},
      ${admin.id}
    )
    RETURNING id
  ` as Record<string, unknown>[]

  await cmsAudit({
    actorId: admin.id, actorEmail: admin.email,
    action: 'announcement_created',
    targetType: 'announcement', targetId: String((result[0] as Record<string, unknown>)?.id ?? ''),
    ip, severity: 'info',
  })

  return NextResponse.json({ ok: true, id: String((result[0] as Record<string, unknown>)?.id ?? '') })
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json() as { id: string; action: 'deactivate' | 'activate' | 'delete' }
  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  if (action === 'deactivate') {
    await sql`UPDATE announcements SET is_active = FALSE WHERE id = ${id}`
  } else if (action === 'activate') {
    await sql`UPDATE announcements SET is_active = TRUE WHERE id = ${id}`
  } else if (action === 'delete') {
    await sql`DELETE FROM announcements WHERE id = ${id}`
  } else {
    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  }

  await cmsAudit({
    actorId: admin.id, actorEmail: admin.email,
    action: `announcement_${action}d`,
    targetType: 'announcement', targetId: id,
    ip, severity: 'info',
  })

  return NextResponse.json({ ok: true })
}
