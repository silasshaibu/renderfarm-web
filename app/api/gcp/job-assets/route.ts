import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'

// GET /api/gcp/job-assets?jobId=<dbId>
// Internal-only (render VM). Returns the job's dependency assets with resolvable
// download URLs so the VM can fetch them before rendering. Excludes the .blend.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ message: 'jobId required' }, { status: 400 })

  await initDB()

  const rows = await sql`SELECT manifest FROM jobs WHERE id = ${jobId} LIMIT 1` as Record<string, unknown>[]
  if (!rows.length) return NextResponse.json([])

  let manifest = rows[0].manifest as unknown
  if (typeof manifest === 'string') {
    try { manifest = JSON.parse(manifest) } catch { manifest = {} }
  }
  const assets = ((manifest as Record<string, unknown>)?.assets ?? []) as Array<{
    path?: string; sha256?: string; type?: string
  }>

  const out: Array<{ rel_path: string; name: string; blob_url: string; type: string }> = []
  for (const a of assets) {
    if (!a.sha256 || a.type === 'blend') continue
    const urlRows = await sql`SELECT blob_url FROM assets WHERE sha256 = ${a.sha256} LIMIT 1` as Record<string, unknown>[]
    const blobUrl = urlRows[0]?.blob_url as string | undefined
    if (!blobUrl) continue
    const rel = a.path ?? ''
    const name = rel.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
    if (!name) continue
    out.push({ rel_path: rel, name, blob_url: blobUrl, type: a.type ?? 'file' })
  }

  return NextResponse.json(out)
}
