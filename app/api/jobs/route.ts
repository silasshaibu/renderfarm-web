import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

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

// ---------------------------------------------------------------------------
// In-memory job store — replace with Neon/Postgres later
// ---------------------------------------------------------------------------
interface Job {
  id:          string
  jobNumber:   string
  title:       string
  status:      'queued' | 'running' | 'done' | 'failed'
  frames:      string
  software:    string
  createdAt:   string
  blenderFile: string        // Vercel Blob URL of the uploaded scene zip
  outputs:     string[]      // Rendered frame URLs — populated by the render worker
}

const jobs: Job[] = [
  {
    id: '1', jobNumber: 'RF-0001',
    title: 'BMW_Cycles_Final.blend', status: 'done',
    frames: '1-250', software: 'blender-3-6-lts',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    blenderFile: '', outputs: [],
  },
  {
    id: '2', jobNumber: 'RF-0002',
    title: 'ProductShot_v3.blend', status: 'running',
    frames: '1-100', software: 'blender-4-1',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    blenderFile: '', outputs: [],
  },
]

let nextId = 3

// GET /api/jobs — list all jobs, or single job with ?jobNumber=RF-0001
export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const jobNumber = req.nextUrl.searchParams.get('jobNumber')
  if (jobNumber) {
    const job = jobs.find(j => j.jobNumber === jobNumber)
    if (!job) return NextResponse.json({ message: 'Job not found' }, { status: 404 })
    return NextResponse.json(job)
  }

  return NextResponse.json(jobs)
}

// POST /api/jobs — create a new job (called by the Blender addon after upload)
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const data = await req.json() as {
    title?:        string
    frames?:       string
    software?:     string
    blender_file?: string   // blob URL of the uploaded scene zip
  }

  const job: Job = {
    id:          String(nextId),
    jobNumber:   `RF-${String(nextId).padStart(4, '0')}`,
    title:       data.title       ?? 'Untitled Job',
    status:      'queued',
    frames:      data.frames      ?? '1-1',
    software:    data.software    ?? 'blender-4-1',
    createdAt:   new Date().toISOString(),
    blenderFile: data.blender_file ?? '',
    outputs:     [],
  }

  jobs.push(job)
  nextId++

  return NextResponse.json({ jobNumber: job.jobNumber, id: job.id }, { status: 201 })
}

// PATCH /api/jobs/[id] — worker updates status / adds output frame URLs
// We handle this inline because App Router dynamic routes need a separate file,
// but we expose a ?id= query param workaround for the worker.
export async function PATCH(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const id   = req.nextUrl.searchParams.get('id')
  const body = await req.json() as { status?: Job['status']; outputs?: string[] }

  const job = jobs.find(j => j.id === id)
  if (!job) return NextResponse.json({ message: 'Job not found' }, { status: 404 })

  if (body.status)  job.status  = body.status
  if (body.outputs) job.outputs = body.outputs

  return NextResponse.json(job)
}
