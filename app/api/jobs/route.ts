import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean }
  } catch {
    return null
  }
}

// Map a DB row → the ApiJob shape the frontend expects
function rowToJob(row: Record<string, unknown>) {
  return {
    id:          String(row.id),
    jobNumber:   row.job_number,
    title:       row.title,
    status:      row.status,
    frames:      row.frames,
    software:    row.software,
    createdAt:   row.created_at,
    blenderFile: row.blender_file ?? '',
    outputs:     (row.outputs as string[]) ?? [],
  }
}

// GET /api/jobs — list all jobs, or single job with ?jobNumber=RF-XXXX
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const jobNumber = req.nextUrl.searchParams.get('jobNumber')
  if (jobNumber) {
    const rows = await sql`SELECT * FROM jobs WHERE job_number = ${jobNumber}`
    if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
    return NextResponse.json(rowToJob(rows[0] as Record<string, unknown>))
  }

  const rows = await sql`SELECT * FROM jobs ORDER BY created_at DESC`
  return NextResponse.json(rows.map(r => rowToJob(r as Record<string, unknown>)))
}

// POST /api/jobs — create a new job (called by the Blender addon after upload)
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const data = await req.json() as {
    title?:          string
    frames?:         string
    software?:       string
    blender_file?:   string
    status?:         string
    manifest?:       Record<string, unknown>
    assets_total?:   number
    assets_uploaded?: number
  }

  // Validate status — only allow known values
  const VALID_STATUSES = ['queued', 'uploading', 'running', 'done', 'failed']
  const status = (data.status && VALID_STATUSES.includes(data.status))
    ? data.status
    : 'queued'

  // Generate next RF-XXXX number
  const countRows = await sql`SELECT COUNT(*) AS cnt FROM jobs`
  const nextNum   = Number((countRows[0] as Record<string, unknown>).cnt) + 1
  const jobNumber = `RF-${String(nextNum).padStart(4, '0')}`

  const manifest      = data.manifest      ? JSON.stringify(data.manifest)  : '{}'
  const assetsTotal   = data.assets_total   ?? 0
  const assetsUploaded = data.assets_uploaded ?? 0

  const rows = await sql`
    INSERT INTO jobs (job_number, title, frames, software, blender_file, status, manifest, assets_total, assets_uploaded)
    VALUES (
      ${jobNumber},
      ${data.title        ?? 'Untitled Job'},
      ${data.frames       ?? '1-1'},
      ${data.software     ?? 'blender-4-1'},
      ${data.blender_file ?? ''},
      ${status},
      ${manifest}::jsonb,
      ${assetsTotal},
      ${assetsUploaded}
    )
    RETURNING *
  `

  const job = rowToJob(rows[0] as Record<string, unknown>)
  return NextResponse.json({ jobNumber: job.jobNumber, id: job.id }, { status: 201 })
}

// PATCH /api/jobs?id= — render worker updates status + output frame URLs
export async function PATCH(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const id   = req.nextUrl.searchParams.get('id')   // numeric id from worker
  const body = await req.json() as { status?: string; outputs?: string[]; assets_uploaded?: number }

  const rows = await sql`
    UPDATE jobs
    SET status          = COALESCE(${body.status ?? null}, status),
        outputs         = COALESCE(${body.outputs ? JSON.stringify(body.outputs) : null}::jsonb, outputs),
        assets_uploaded = COALESCE(${body.assets_uploaded ?? null}, assets_uploaded),
        updated_at      = NOW()
    WHERE id = ${id}
    RETURNING *
  `

  if (!rows.length) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
  return NextResponse.json(rowToJob(rows[0] as Record<string, unknown>))
}
