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
// In-memory project store — replace with Neon/Postgres later
// ---------------------------------------------------------------------------
const projects = [
  { id: '1', name: 'BMW Product Shots', isActive: true },
  { id: '2', name: 'Arch Interior Series', isActive: true },
  { id: '3', name: 'Character Animation Q1', isActive: false },
]

export async function GET(req: NextRequest) {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(projects)
}
