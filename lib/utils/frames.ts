/**
 * Parse Conductor-style frame specs into a sorted array of unique frame numbers.
 *
 * Examples:
 *   "1-10"       → [1,2,3,4,5,6,7,8,9,10]
 *   "1,5,10-15"  → [1,5,10,11,12,13,14,15]
 *   "1-100x10"   → [1,11,21,31,41,51,61,71,81,91]  (every 10th frame)
 *   "7-9"        → [7,8,9]
 */
export function parseFrameRange(spec: string): number[] {
  const frames = new Set<number>()

  spec.split(/[\s,]+/).forEach(part => {
    const rangeMatch = part.match(/^(\d+)-(\d+)(?:x(\d+))?$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1])
      const end   = parseInt(rangeMatch[2])
      const step  = parseInt(rangeMatch[3] ?? '1')
      for (let f = start; f <= end; f += step) frames.add(f)
    } else {
      const single = parseInt(part)
      if (!isNaN(single)) frames.add(single)
    }
  })

  return Array.from(frames).sort((a, b) => a - b)
}

// ── Chunk task descriptor ─────────────────────────────────────────────────────
export interface TaskChunk {
  index:      number    // 0-based chunk index (used as task ID)
  frames:     number[]  // every frame number in this chunk
  startFrame: number    // first frame
  endFrame:   number    // last frame (same as startFrame for chunk_size=1)
  isScout:    boolean   // true if ANY frame in the chunk is a scout frame
}

/**
 * Divide an ordered frame list into sequential chunks of `chunkSize`.
 * A chunk is marked as a scout task if it contains any scout frame.
 *
 * Rules:
 *  - Chunks are filled sequentially; no frames skipped or repeated.
 *  - The last chunk may be smaller than chunkSize.
 *  - If scoutFrames is empty, ALL chunks are non-scout (all start immediately).
 */
export function chunkFrames(
  allFrames:   number[],
  chunkSize:   number,
  scoutFrames: number[] = [],
): TaskChunk[] {
  const scoutSet = new Set(scoutFrames)
  const size     = Math.max(1, chunkSize)
  const chunks: TaskChunk[] = []

  for (let i = 0; i < allFrames.length; i += size) {
    const frames = allFrames.slice(i, i + size)
    chunks.push({
      index:      chunks.length,
      frames,
      startFrame: frames[0],
      endFrame:   frames[frames.length - 1],
      isScout:    frames.some(f => scoutSet.has(f)),
    })
  }
  return chunks
}

/**
 * Resolve fml:N / auto:N shorthand or fall back to explicit frame list.
 * Returns scout frame numbers as a sorted array.
 */
export function resolveScoutFrames(expr: string, allFrames: number[]): number[] {
  if (!expr.trim() || !allFrames.length) return []
  const e = expr.trim().toLowerCase()

  // fml:N — first, middle(s), last
  const fmlMatch = e.match(/^fml:(\d+)$/)
  if (fmlMatch) {
    const n = Math.max(1, parseInt(fmlMatch[1]))
    if (n === 1) return [allFrames[0]]
    if (n === 2) return [allFrames[0], allFrames[allFrames.length - 1]]
    const indices = [0]
    for (let i = 1; i < n - 1; i++) {
      indices.push(Math.round(i * (allFrames.length - 1) / (n - 1)))
    }
    indices.push(allFrames.length - 1)
    return [...new Set(indices.map(i => allFrames[i]))].sort((a, b) => a - b)
  }

  // auto:N — evenly distributed
  const autoMatch = e.match(/^auto:(\d+)$/)
  if (autoMatch) {
    const n = Math.max(1, parseInt(autoMatch[1]))
    if (n >= allFrames.length) return [...allFrames]
    const indices = n === 1
      ? [0]
      : Array.from({ length: n }, (_, i) => Math.round(i * (allFrames.length - 1) / (n - 1)))
    return [...new Set(indices.map(i => allFrames[i]))].sort((a, b) => a - b)
  }

  // Explicit list — parse and filter to frames that exist in allFrames
  const set = new Set(allFrames)
  return parseFrameRange(expr).filter(f => set.has(f))
}
