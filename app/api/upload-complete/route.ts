import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Vercel Blob calls this webhook after a client upload completes.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'],
        maximumSizeInBytes: 5 * 1024 * 1024 * 1024, // 5 GB
        tokenPayload: pathname,
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // TODO: update job record in DB with blob.url
        console.log('[upload-complete]', blob.url, tokenPayload)
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Webhook error' },
      { status: 400 },
    )
  }
}
