/**
 * Parse Conductor-style frame specs into an array of frame numbers.
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
