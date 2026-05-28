import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { randomBytes } from 'crypto'

async function ensureApiKeyCol() {
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key TEXT DEFAULT NULL`
}

function generateKey(): string {
  return `rf_live_${randomBytes(24).toString('hex')}`
}

// GET /api/profile/api-key
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureApiKeyCol()

  const rows = await sql`SELECT api_key FROM users WHERE id = ${user.sub} LIMIT 1` as Record<string, unknown>[]
  const existing = rows[0]?.api_key as string | null

  if (!existing) {
    // Auto-generate on first access
    const key = generateKey()
    await sql`UPDATE users SET api_key = ${key} WHERE id = ${user.sub}`
    return NextResponse.json({ key })
  }

  return NextResponse.json({ key: existing })
}

// POST /api/profile/api-key — regenerate
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  await initDB()
  await ensureApiKeyCol()

  const key = generateKey()
  await sql`UPDATE users SET api_key = ${key} WHERE id = ${user.sub}`

  return NextResponse.json({ key })
}
