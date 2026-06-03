import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { updateAbuseScore } from '@/lib/abuseScoring'

export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  await initDB()

  const rows = await sql`
    SELECT
      uas.user_id as id,
      u.email,
      uas.score,
      u.status,
      COUNT(DISTINCT abs.id) as signals_count,
      MAX(abs.created_at) as last_signal,
      uas.last_updated
    FROM user_abuse_scores uas
    JOIN users u ON u.id = uas.user_id
    LEFT JOIN abuse_signals abs ON abs.user_id = uas.user_id
    WHERE uas.score >= 30
    GROUP BY uas.user_id, u.email, uas.score, u.status, uas.last_updated
    ORDER BY uas.score DESC
    LIMIT 500
  ` as Record<string, unknown>[]

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user?.is_admin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { userId, delta, reason } = await req.json() as {
    userId: number
    delta: number
    reason: string
  }

  if (!userId || !delta || !reason) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  try {
    const newScore = await updateAbuseScore(userId, delta, reason)
    return NextResponse.json({ ok: true, newScore })
  } catch (e) {
    console.error('[abuse-scores] POST error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
