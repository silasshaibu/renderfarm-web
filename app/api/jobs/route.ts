import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
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
const jobs: {
  id: string
  jobNumber: string
  title: string
  status: 'queued' | 'running' | 'done' | 'failed'
  frames: string
  software: string
  createdAt: string
}[] = [
  {
    id: '1',
    jobNumber: 'RF-0001',
    title: 'BMW_Cycles_Final.blend',
    status: 'done',
    frames: '1-250',
    software: 'blender-3-6-lts',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: '2',
    jobNumber: 'RF-0002',
    title: 'ProductShot_v3.blend',
    status: 'running',
    frames: '1-100',
    software: 'blender-4-1',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    jobNumber: 'RF-0003',
    title: 'Arch_Interior_Night.max',
    status: 'queued',
    frames: '1-500',
    software: '3ds-max-2025',
    createdAt: new Date().toISOString(),
  },
]

let nextId = 4

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const data = await req.json() as {
    title?: string
    frames?: string
    software?: string
    project?: string
  }

  const job = {
    id: String(nextId),
    jobNumber: `RF-${String(nextId).padStart(4, '0')}`,
    title: data.title ?? 'Untitled Job',
    status: 'queued' as const,
    frames: data.frames ?? '1-1',
    software: data.software ?? 'blender-4-1',
    createdAt: new Date().toISOString(),
  }

  jobs.push(job)
  nextId++

  return NextResponse.json({ jobNumber: job.jobNumber }, { status: 201 })
}
