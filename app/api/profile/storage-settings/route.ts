import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const rows = await sql`
    SELECT
      storage_auto_purge_days,
      storage_cost_alert
    FROM users
    WHERE id = ${user.sub}
    LIMIT 1
  ` as Record<string, unknown>[]

  if (!rows.length) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    autoPurgeDays: Number(rows[0].storage_auto_purge_days ?? 20),
    costAlertThreshold: Number(rows[0].storage_cost_alert ?? 5.00),
  })
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.isSuperAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })

  await initDB()

  const { autoPurgeDays, costAlertThreshold } = await req.json() as {
    autoPurgeDays?: number
    costAlertThreshold?: number
  }

  try {
    await sql`
      UPDATE users
      SET storage_auto_purge_days = COALESCE(${autoPurgeDays ?? null}, storage_auto_purge_days),
          storage_cost_alert = COALESCE(${costAlertThreshold ?? null}, storage_cost_alert)
      WHERE id = ${user.sub}
    `

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[storage-settings] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
