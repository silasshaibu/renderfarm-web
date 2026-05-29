import { NextRequest, NextResponse } from 'next/server'
import { verifyCmsRequest, cmsAudit } from '@/lib/cms-auth'
import { sql, initDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const limit  = Math.min(Number(searchParams.get('limit') ?? 50), 200)
  const offset = Number(searchParams.get('offset') ?? 0)

  const rows = await sql`
    SELECT
      j.id, j.job_number, j.title, j.status, j.created_at, j.updated_at,
      j.frame_range, j.chunk_size, j.output_path,
      u.email AS user_email, u.id AS user_id
    FROM jobs j
    LEFT JOIN users u ON u.id = j.user_id
    WHERE
      (${search} = '' OR j.title ILIKE ${'%' + search + '%'} OR j.job_number::text ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR j.status = ${status})
    ORDER BY j.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as Record<string, unknown>[]

  const total = await sql`
    SELECT COUNT(*) AS cnt FROM jobs j LEFT JOIN users u ON u.id = j.user_id
    WHERE
      (${search} = '' OR j.title ILIKE ${'%' + search + '%'} OR j.job_number::text ILIKE ${'%' + search + '%'} OR u.email ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR j.status = ${status})
  ` as Record<string, unknown>[]

  return NextResponse.json({
    jobs: rows.map(r => ({
      id:         String(r.id),
      jobNumber:  r.job_number,
      title:      r.title,
      status:     r.status,
      createdAt:  r.created_at,
      updatedAt:  r.updated_at,
      frameRange: r.frame_range ?? '',
      chunkSize:  r.chunk_size ?? 1,
      outputPath: r.output_path ?? '',
      userEmail:  r.user_email ?? '',
      userId:     String(r.user_id ?? ''),
    })),
    total: Number((total[0] as Record<string, unknown>)?.cnt ?? 0),
  })
}

export async function PATCH(req: NextRequest) {
  const admin = await verifyCmsRequest(req)
  if (!admin) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json() as { id: string; action: string }
  await initDB()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? ''

  if (action === 'cancel') {
    await sql`UPDATE jobs SET status = 'cancelled' WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'job_cancelled', targetType: 'job', targetId: id, ip, severity: 'warning' })
  } else if (action === 'delete') {
    await sql`DELETE FROM jobs WHERE id = ${id}`
    await cmsAudit({ actorId: admin.id, actorEmail: admin.email, action: 'job_deleted', targetType: 'job', targetId: id, ip, severity: 'critical' })
  } else {
    return NextResponse.json({ message: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
