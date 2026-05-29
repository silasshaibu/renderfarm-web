import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''

  const [summaryRows, rows] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)      AS granted,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE amount < 0), 0) AS consumed,
        COALESCE(SUM(amount), 0)                                 AS outstanding
      FROM credits
    `.catch(() => [{}]) as Promise<Record<string, unknown>[]>,

    sql`
      SELECT c.id, c.user_id, c.amount, c.description, c.granted_by, c.created_at,
             u.email AS user_email
      FROM credits c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE (${q} = '' OR u.email ILIKE ${'%' + q + '%'} OR c.description ILIKE ${'%' + q + '%'})
      ORDER BY c.created_at DESC
      LIMIT 500
    ` as Promise<Record<string, unknown>[]>,
  ])

  const s = summaryRows[0] ?? {}

  return NextResponse.json({
    summary: {
      granted:     Number(s.granted ?? 0),
      consumed:    Number(s.consumed ?? 0),
      outstanding: Number(s.outstanding ?? 0),
    },
    rows: rows.map(r => ({
      id:          String(r.id),
      userId:      String(r.user_id),
      userEmail:   r.user_email ?? '',
      amount:      Number(r.amount),
      description: r.description ?? '',
      grantedBy:   r.granted_by ?? null,
      createdAt:   r.created_at,
    })),
  })
}
