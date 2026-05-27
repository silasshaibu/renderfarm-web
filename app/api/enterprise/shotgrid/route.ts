import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS enterprise_shotgrid (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      conductor_project   TEXT NOT NULL DEFAULT '',
      shotgrid_project_id TEXT NOT NULL DEFAULT '',
      shotgrid_host       TEXT NOT NULL DEFAULT '',
      script_name         TEXT NOT NULL DEFAULT '',
      api_key             TEXT NOT NULL DEFAULT '',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `
}

function rowToConfig(r: Record<string, unknown>) {
  return {
    id:                 String(r.id),
    conductorProject:   r.conductor_project   as string,
    shotgridProjectId:  r.shotgrid_project_id as string,
    shotgridHost:       r.shotgrid_host       as string,
    scriptName:         r.script_name         as string,
    apiKey:             r.api_key             as string,
    createdAt:          r.created_at,
  }
}

// GET /api/enterprise/shotgrid
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  await initDB()
  await ensureTable()
  const rows = await sql`SELECT * FROM enterprise_shotgrid ORDER BY created_at ASC`
  return NextResponse.json((rows as Record<string, unknown>[]).map(rowToConfig))
}

// POST /api/enterprise/shotgrid
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user || !user.isAdmin) return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  await initDB()
  await ensureTable()
  const b = await req.json() as {
    conductorProject?: string; shotgridProjectId?: string; shotgridHost?: string
    scriptName?: string; apiKey?: string
  }
  const rows = await sql`
    INSERT INTO enterprise_shotgrid
      (conductor_project, shotgrid_project_id, shotgrid_host, script_name, api_key)
    VALUES (
      ${b.conductorProject   ?? ''},
      ${b.shotgridProjectId  ?? ''},
      ${b.shotgridHost       ?? ''},
      ${b.scriptName         ?? ''},
      ${b.apiKey             ?? ''}
    )
    RETURNING *
  ` as Record<string, unknown>[]
  return NextResponse.json(rowToConfig(rows[0]), { status: 201 })
}
