import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

async function ensureAnnouncementsTable() {
  await initDB()
  await sql`
    CREATE TABLE IF NOT EXISTS announcements (
      id              SERIAL PRIMARY KEY,
      title           TEXT NOT NULL,
      message         TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'info',
      audience        TEXT NOT NULL DEFAULT 'all',
      target_user_ids JSONB DEFAULT '[]',
      show_from       TIMESTAMPTZ DEFAULT NOW(),
      show_until      TIMESTAMPTZ DEFAULT NULL,
      dismissible     BOOLEAN DEFAULT TRUE,
      created_by      INTEGER DEFAULT NULL,
      is_active       BOOLEAN DEFAULT TRUE,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => null)
}

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await ensureAnnouncementsTable()
  const rows = await sql`
    SELECT id, title, message, type, audience, show_from, show_until,
           dismissible, is_active, created_at
    FROM announcements ORDER BY created_at DESC LIMIT 100
  ` as Record<string, unknown>[]

  return NextResponse.json(rows.map(r => ({
    id:          String(r.id),
    title:       r.title,
    message:     r.message,
    type:        r.type ?? 'info',
    audience:    r.audience ?? 'all',
    showUntil:   r.show_until ?? null,
    dismissible: Boolean(r.dismissible),
    isActive:    Boolean(r.is_active),
    createdAt:   r.created_at,
  })))
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    title: string; message: string; type?: string; audience?: string
    showUntil?: string | null; dismissible?: boolean
  }
  if (!body.title?.trim() || !body.message?.trim()) {
    return NextResponse.json({ message: 'Title and message are required' }, { status: 400 })
  }

  await ensureAnnouncementsTable()
  const result = await sql`
    INSERT INTO announcements (title, message, type, audience, show_from, show_until, dismissible, created_by)
    VALUES (${body.title}, ${body.message}, ${body.type ?? 'info'}, ${body.audience ?? 'all'},
            ${new Date().toISOString()}, ${body.showUntil ?? null}, ${body.dismissible !== false}, ${Number(user.sub)})
    RETURNING id
  ` as Record<string, unknown>[]

  return NextResponse.json({ ok: true, id: String(result[0]?.id ?? '') })
}

export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  const { id, action } = await req.json() as { id: string; action: 'activate' | 'deactivate' | 'delete' }
  await ensureAnnouncementsTable()

  if (action === 'activate')        await sql`UPDATE announcements SET is_active = TRUE  WHERE id = ${id}`
  else if (action === 'deactivate') await sql`UPDATE announcements SET is_active = FALSE WHERE id = ${id}`
  else if (action === 'delete')     await sql`DELETE FROM announcements WHERE id = ${id}`
  else return NextResponse.json({ message: 'Unknown action' }, { status: 400 })

  return NextResponse.json({ ok: true })
}
