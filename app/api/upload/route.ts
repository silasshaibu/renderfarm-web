import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { put } from '@vercel/blob'



// PUT /api/upload?filename=scene.zip
// Body  : raw zip bytes
// Header: Authorization: Bearer <jwt>
//
// Blender uploads the zip directly here; we proxy it into Vercel Blob
// using the server-side BLOB_READ_WRITE_TOKEN so private stores work.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  if (!req.body) {
    return NextResponse.json({ message: 'No file body provided' }, { status: 400 })
  }

  const filename = req.nextUrl.searchParams.get('filename') ?? 'scene.zip'
  const pathname = `scenes/${user.sub}/${Date.now()}-${filename}`

  try {
    const blob = await put(pathname, req.body, {
      access:      'public',          // render workers can fetch it by URL
      contentType: req.headers.get('content-type') ?? 'application/zip',
    })

    return NextResponse.json({ url: blob.url, pathname: blob.pathname })
  } catch (err) {
    console.error('[upload]', err)
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    )
  }
}
