import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'



// POST { filename: "scene.zip" }
// Returns { clientToken, uploadUrl } — Blender PUTs the file directly to
// Vercel Blob using the clientToken.  The file never passes through our
// serverless function, so there is no timeout or size limit from our side.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { filename } = await req.json() as { filename?: string }
  if (!filename) return NextResponse.json({ message: 'filename required' }, { status: 400 })

  const pathname = `scenes/${user.sub}/${Date.now()}-${filename}`

  try {
    const clientToken = await generateClientTokenFromReadWriteToken({
      token:            process.env.BLOB_READ_WRITE_TOKEN!,
      pathname,
      addRandomSuffix:  false,   // keep pathname predictable so we can build the PUT URL
      onUploadCompleted: {
        callbackUrl:   `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://renderfarm-web.vercel.app'}/api/upload-complete`,
        tokenPayload:  JSON.stringify({ userId: user.sub, email: user.email }),
      },
    })

    // Blender PUTs directly to this URL with Authorization: Bearer {clientToken}
    return NextResponse.json({
      clientToken,
      uploadUrl: `https://blob.vercel-storage.com/${pathname}`,
      pathname,
    })
  } catch (err) {
    console.error('[upload-url]', err)
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to generate upload token' },
      { status: 500 },
    )
  }
}
