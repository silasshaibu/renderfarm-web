/** Parse a frame range expression into a sorted array of frame numbers. */
export function parseFrameSpec(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const dash = part.indexOf('-', 1)
    if (dash > 0) {
      const a = parseInt(part.slice(0, dash), 10)
      const b = parseInt(part.slice(dash + 1), 10)
      if (!isNaN(a) && !isNaN(b)) {
        const lo = Math.min(a, b), hi = Math.max(a, b)
        for (let i = lo; i <= hi; i++) out.add(i)
        continue
      }
    }
    const n = parseInt(part, 10)
    if (!isNaN(n)) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

export function frameCount(spec: string): number {
  return parseFrameSpec(spec).length
}

export function isValidFrameSpec(spec: string): boolean {
  return spec.trim().length > 0 && frameCount(spec) > 0
}

/** Chunk frames into groups of size chunkSize. Returns array of [startFrame, endFrame] tuples. */
export function chunkFrames(frames: number[], chunkSize: number): [number, number][] {
  const chunks: [number, number][] = []
  for (let i = 0; i < frames.length; i += chunkSize) {
    const slice = frames.slice(i, i + chunkSize)
    chunks.push([slice[0], slice[slice.length - 1]])
  }
  return chunks
}

/** Ensure the job_files and rerender columns exist. */
export async function ensureReRenderSchema(sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) {
  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id INTEGER DEFAULT NULL`.catch(() => null)
  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reused_files_count INTEGER DEFAULT 0`.catch(() => null)
  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS rerender_number INTEGER DEFAULT 0`.catch(() => null)

  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`
    CREATE TABLE IF NOT EXISTS job_files (
      id           SERIAL PRIMARY KEY,
      job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      file_path    TEXT NOT NULL DEFAULT '',
      file_name    TEXT NOT NULL DEFAULT '',
      md5_hash     TEXT NOT NULL DEFAULT '',
      file_size    BIGINT DEFAULT 0,
      storage_key  TEXT DEFAULT '',
      still_exists BOOLEAN DEFAULT TRUE,
      uploaded_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(() => null)

  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`
    CREATE INDEX IF NOT EXISTS idx_job_files_job_id ON job_files (job_id)
  `.catch(() => null)
  await (sql as unknown as { (...args: unknown[]): Promise<unknown[]> })`
    CREATE INDEX IF NOT EXISTS idx_job_files_md5 ON job_files (md5_hash)
  `.catch(() => null)
}
