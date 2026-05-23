import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'renderfarm-dev-secret-change-in-production'

function verifyToken(req: NextRequest): { sub: string; email: string } | null {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string; email: string }
  } catch {
    return null
  }
}

// POST — called by Blender to get a client upload token
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: [
          'application/zip',
          'application/octet-stream',
          'application/x-zip-compressed',
        ],
        maximumSizeInBytes: 1024 * 1024 * 1024, // 1 GB
        tokenPayload: JSON.stringify({ userId: user.sub, email: user.email, pathname }),
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by Vercel after upload finishes — log or save to DB here
        console.log('[upload] completed', blob.url, tokenPayload)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Upload token error' },
      { status: 400 },
    )
  }
}
