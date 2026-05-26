import { storageClient, GCP_BUCKET } from './clients'

/**
 * Generate a signed URL so the client can upload directly to GCS.
 * The file never passes through Vercel — no timeout issue.
 */
export async function getSignedUploadUrl(
  jobId: string,
  filename: string
): Promise<{ uploadUrl: string; gcsPath: string }> {
  const gcsPath = `jobs/${jobId}/${filename}`

  const [url] = await storageClient
    .bucket(GCP_BUCKET)
    .file(gcsPath)
    .getSignedUrl({
      action:      'write',
      expires:     Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'application/octet-stream',
    })

  return { uploadUrl: url, gcsPath }
}

/**
 * List all rendered output files for a completed job
 */
export async function listOutputFiles(jobId: string): Promise<string[]> {
  const [files] = await storageClient.bucket(GCP_BUCKET).getFiles({
    prefix: `output/${jobId}/`,
  })
  return files.map(f => f.name)
}

/**
 * Generate signed download URLs for all rendered frames (1-hour TTL).
 * These are returned to the Electron downloader just like Vercel Blob URLs.
 */
export async function getSignedDownloadUrls(jobId: string): Promise<string[]> {
  const files = await listOutputFiles(jobId)
  if (!files.length) return []

  const urls = await Promise.all(
    files.map(async (filePath) => {
      const [url] = await storageClient
        .bucket(GCP_BUCKET)
        .file(filePath)
        .getSignedUrl({
          action:  'read',
          expires: Date.now() + 60 * 60 * 1000, // 1 hour
        })
      return url
    })
  )

  return urls
}
