import { NextRequest, NextResponse } from 'next/server'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { decayAbuseScores } from '@/lib/abuseScoring'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const updated = await decayAbuseScores()
    return NextResponse.json({ ok: true, decayedUsers: updated })
  } catch (e) {
    console.error('[abuse-decay-cron] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
