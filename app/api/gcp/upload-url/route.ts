import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { getSignedUploadUrl } from '@/lib/gcp/storage'

// POST { jobId: string, filename: string }
// Returns { uploadUrl, gcsPath } — client uploads directly to GCS, never via Vercel
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { jobId, filename } = await req.json() as { jobId?: string; filename?: string }
  if (!jobId || !filename) {
    return NextResponse.json({ message: 'jobId and filename are required' }, { status: 400 })
  }

  try {
    const result = await getSignedUploadUrl(jobId, filename)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[gcp/upload-url]', err)
    return NextResponse.json(
      { message: err instanceof Error ? err.message : 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
