import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest) {
  const auth  = req.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; isAdmin: boolean }
  } catch {
    return null
  }
}

// POST /api/jobs/preflight
// Body: { assets: [{ sha256: string }] }
// Returns: { missing: string[] } — SHA256s not yet in the assets table
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()

  const body = await req.json() as { assets?: { sha256: string }[] }
  const assets = body.assets ?? []

  if (!Array.isArray(assets)) {
    return NextResponse.json({ message: 'assets must be an array' }, { status: 400 })
  }

  if (assets.length === 0) {
    return NextResponse.json({ missing: [] })
  }

  // Extract all sha256 values from the request
  const requested = assets.map(a => a.sha256).filter(Boolean)

  if (requested.length === 0) {
    return NextResponse.json({ missing: [] })
  }

  // Query which sha256s already exist in the assets table
  const rows = await sql`
    SELECT sha256 FROM assets
    WHERE sha256 = ANY(${requested})
  `

  const existing = new Set(rows.map(r => (r as Record<string, unknown>).sha256 as string))
  const missing  = requested.filter(h => !existing.has(h))

  return NextResponse.json({ missing })
}
