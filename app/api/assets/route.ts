import { NextRequest, NextResponse } from 'next/server'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import jwt from 'jsonwebtoken'
import { sql, initDB } from '@/lib/db'
import path from 'path'

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

// POST /api/assets?action=token
// Body: { sha256, filename, size_bytes }
// Returns: { exists: true, url } OR { exists: false, clientToken, uploadUrl, pathname }
async function handleToken(req: NextRequest) {
  await initDB()

  const body = await req.json() as {
    sha256?:     string
    filename?:   string
    size_bytes?: number
  }

  const { sha256, filename, size_bytes } = body

  if (!sha256) {
    return NextResponse.json({ message: 'sha256 required' }, { status: 400 })
  }

  // Check if this asset already exists
  const rows = await sql`SELECT sha256, blob_url FROM assets WHERE sha256 = ${sha256}`
  if (rows.length > 0) {
    const row = rows[0] as Record<string, unknown>
    return NextResponse.json({ exists: true, url: row.blob_url })
  }

  // Generate upload token for new asset
  const ext      = filename ? path.extname(filename) : ''
  const pathname = `assets/${sha256}${ext}`

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token:           process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      addRandomSuffix: false,
    })

    return NextResponse.json({
      exists:      false,
      clientToken,
      uploadUrl:   `https://blob.vercel-storage.com/${pathname}`,
      pathname,
    })
  } catch (err) {
    console.error('[assets/token]', err)
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to generate upload token' },
      { status: 500 },
    )
  }
}

// POST /api/assets?action=confirm
// Body: { sha256, url, filename, size_bytes }
// Inserts the asset record into the DB
async function handleConfirm(req: NextRequest) {
  await initDB()

  const body = await req.json() as {
    sha256?:     string
    url?:        string
    filename?:   string
    size_bytes?: number
  }

  const { sha256, url, filename, size_bytes } = body

  if (!sha256 || !url) {
    return NextResponse.json({ message: 'sha256 and url required' }, { status: 400 })
  }

  await sql`
    INSERT INTO assets (sha256, blob_url, filename, size_bytes)
    VALUES (${sha256}, ${url}, ${filename ?? null}, ${size_bytes ?? 0})
    ON CONFLICT (sha256) DO UPDATE SET blob_url = EXCLUDED.blob_url
  `

  return NextResponse.json({ ok: true })
}

// Route dispatcher — handles both actions in a single file
export async function POST(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const action = req.nextUrl.searchParams.get('action')

  if (action === 'token') {
    return handleToken(req)
  }

  if (action === 'confirm') {
    return handleConfirm(req)
  }

  return NextResponse.json(
    { message: 'action query param must be "token" or "confirm"' },
    { status: 400 },
  )
}
