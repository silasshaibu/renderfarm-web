import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth-server'
import { sql, initDB } from '@/lib/db'
import { ensureReRenderSchema } from '@/lib/frames'

type Params = { params: Promise<{ jobNumber: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })

  const { jobNumber } = await params
  await initDB()
  await ensureReRenderSchema(sql as Parameters<typeof ensureReRenderSchema>[0])

  const jobRows = await sql`
    SELECT id, user_id, provider, gcs_scene_path FROM jobs WHERE job_number = ${jobNumber} LIMIT 1
  ` as Record<string, unknown>[]
  if (!jobRows.length) return NextResponse.json({ message: 'Not found' }, { status: 404 })

  const job = jobRows[0]
  if (String(job.user_id) !== String(user.sub) && !user.isAdmin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
  }

  const jobIdInt = Number(job.id)
  const provider = String(job.provider ?? 'renderfarm')
  const gcsPath  = String(job.gcs_scene_path ?? '')

  // For GCP jobs — synthesize from gcs_scene_path
  if (provider === 'gcp' && gcsPath) {
    const fileName = gcsPath.split('/').pop() ?? 'scene.blend'
    return NextResponse.json({
      files: [{
        fileName,
        filePath:   gcsPath,
        fileSize:   0,
        md5Hash:    '',
        stillExists: true,
        uploadedAt:  null,
        storageKey:  gcsPath,
      }],
      allAvailable:   true,
      availableCount: 1,
      totalCount:     1,
    })
  }

  // Renderfarm jobs — check job_files table
  const files = await sql`
    SELECT file_name, file_path, file_size, md5_hash, still_exists, uploaded_at, storage_key
    FROM job_files WHERE job_id = ${jobIdInt}
    ORDER BY uploaded_at ASC
  ` as Record<string, unknown>[]

  const available = files.filter(f => (f as Record<string, unknown>).still_exists).length

  return NextResponse.json({
    files: files.map(f => ({
      fileName:    f.file_name,
      filePath:    f.file_path,
      fileSize:    Number(f.file_size ?? 0),
      md5Hash:     f.md5_hash,
      stillExists: Boolean(f.still_exists),
      uploadedAt:  f.uploaded_at,
      storageKey:  f.storage_key ?? '',
    })),
    allAvailable:   available === files.length && files.length > 0,
    availableCount: available,
    totalCount:     files.length,
  })
}
