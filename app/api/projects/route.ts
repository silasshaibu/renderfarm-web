import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'



function rowToProject(r: Record<string, unknown>) {
  return {
    id:        String(r.id),
    name:      r.name      as string,
    isActive:  Boolean(r.is_active),
    createdAt: r.created_at as string,
    // stats are computed lazily — placeholder until we add job counts
    users:     0,
    jobs:      0,
    storageGb: 0,
  }
}

// ── GET /api/projects ─────────────────────────────────────────────────────────
// Returns all projects with job counts joined in.
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const rows = await sql`
    SELECT
      p.id,
      p.name,
      p.is_active,
      p.created_at,
      COUNT(j.id) AS job_count
    FROM projects p
    LEFT JOIN jobs j ON j.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at ASC
  `

  return NextResponse.json(
    (rows as Record<string, unknown>[]).map(r => ({
      id:        String(r.id),
      name:      r.name      as string,
      isActive:  Boolean(r.is_active),
      createdAt: r.created_at as string,
      users:     0,
      jobs:      Number(r.job_count ?? 0),
      storageGb: 0,
    }))
  )
}

// ── POST /api/projects ────────────────────────────────────────────────────────
// Create a new project.
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const { name } = await req.json() as { name?: string }
  if (!name?.trim()) {
    return NextResponse.json({ message: 'Project name is required' }, { status: 400 })
  }

  const rows = await sql`
    INSERT INTO projects (name) VALUES (${name.trim()}) RETURNING *
  `
  return NextResponse.json(rowToProject(rows[0] as Record<string, unknown>), { status: 201 })
}
