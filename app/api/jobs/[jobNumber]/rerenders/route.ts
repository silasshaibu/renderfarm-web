import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureReRenderSchema } from '@/lib/frames'

type Params = { params: Promise<{ jobNumber: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { jobNumber } = await params
  await initDB()
  await ensureReRenderSchema(sql as Parameters<typeof ensureReRenderSchema>[0])

  // Load the job itself
  const jobRows = await sql`
    SELECT id, job_number, title, frames, status, created_at, cost_usd, parent_job_id, user_id, rerender_number
    FROM jobs WHERE job_number = ${jobNumber} LIMIT 1
  ` as Record<string, unknown>[]
  if (!jobRows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const job = jobRows[0]
  if (String(job.user_id) !== String(user.sub) && !user.isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  // Determine root job
  const rootId = job.parent_job_id ? Number(job.parent_job_id) : Number(job.id)
  const rootRows = await sql`
    SELECT id, job_number, title, frames, status, created_at, cost_usd
    FROM jobs WHERE id = ${rootId} LIMIT 1
  ` as Record<string, unknown>[]
  const root = rootRows[0] ?? job

  // All re-renders of this root
  const reRenders = await sql`
    SELECT id, job_number, title, frames, status, created_at, cost_usd, rerender_number
    FROM jobs WHERE parent_job_id = ${rootId}
    ORDER BY rerender_number ASC, created_at ASC
  ` as Record<string, unknown>[]

  const fmt = (r: Record<string, unknown>) => ({
    id:             String(r.id),
    jobNumber:      r.job_number,
    title:          r.title,
    frameRange:     r.frames,
    status:         r.status,
    createdAt:      r.created_at,
    costUsd:        Number(r.cost_usd ?? 0),
    rerenderNumber: Number(r.rerender_number ?? 0),
  })

  return NextResponse.json({
    originalJob: fmt(root as Record<string, unknown>),
    rerenders:   reRenders.map(r => fmt(r as Record<string, unknown>)),
    totalRerenders: reRenders.length,
  })
}
