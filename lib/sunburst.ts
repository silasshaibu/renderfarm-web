/**
 * Pre-computed sunburst ray coordinates.
 *
 * Math.cos / Math.sin floating-point results differ between Node.js (used for
 * SSR) and the browser JS engine, causing React hydration mismatches.
 * Computing once at module-import time (identical on both sides because the
 * same value is serialised into the JS bundle) eliminates the discrepancy.
 */

const round = (n: number) => Math.round(n * 1e4) / 1e4

export interface SunburstRay {
  x1: number; y1: number
  x2: number; y2: number
  thick: boolean
}

export const SUNBURST_RAYS: SunburstRay[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180
  return {
    x1: round(14 + 7  * Math.cos(a)), y1: round(14 + 7  * Math.sin(a)),
    x2: round(14 + 12 * Math.cos(a)), y2: round(14 + 12 * Math.sin(a)),
    thick: i % 3 === 0,
  }
})
