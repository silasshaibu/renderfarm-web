import { NextRequest, NextResponse } from 'next/server'
import { initDB } from '@/lib/db'
import { runAllWranglers } from '@/lib/wrangler/runner'

/**
 * GET /api/virtual-wrangler/run
 *
 * Invoked by Vercel Cron Jobs every 5 minutes.
 * Also accessible manually for debugging (with the CRON_SECRET header).
 *
 * Security: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` on cron invocations.
 * We verify it here so this endpoint can't be triggered by unauthenticated clients.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 })
    }
  }

  await initDB()

  const start = Date.now()
  const result = await runAllWranglers()
  const ms     = Date.now() - start

  return NextResponse.json({
    ok:     true,
    ran:    result.ran,
    errors: result.errors,
    ms,
  })
}
