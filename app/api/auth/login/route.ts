import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

// ---------------------------------------------------------------------------
// In-memory user store — replace with a real DB (Neon/Postgres) later.
// Passwords are bcrypt hashes. To generate a new hash:
//   node -e "const b=require('bcryptjs');console.log(b.hashSync('yourpassword',10))"
// ---------------------------------------------------------------------------
const USERS = [
  {
    id: '1',
    email: 'silasshaibu2@gmail.com',
    // Default password: "password123"  ← change this in .env.local via ADMIN_PASSWORD_HASH
    passwordHash: process.env.ADMIN_PASSWORD_HASH ?? '$2b$10$Nq2zVJgDf.Xv4bX8reuT0u9/kyZiHkA0mlFSl928Yx7PMWA3YSBxy',
    isAdmin: true,
  },
]

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json() as { email?: string; password?: string }

    if (!email || !password) {
      return NextResponse.json({ message: 'Email and password are required' }, { status: 400 })
    }

    const user = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
    if (!user) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 })
    }

    const access_token = jwt.sign(
      { sub: user.id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' },
    )

    return NextResponse.json({
      access_token,
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
    })
  } catch {
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
