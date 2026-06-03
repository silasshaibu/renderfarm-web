import { NextRequest, NextResponse } from 'next/server'
import { INTERNAL_SECRET } from '@/lib/gcp/clients'
import { sendStorageWarnings } from '@/lib/storageNotifications'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${INTERNAL_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sent = await sendStorageWarnings()
    return NextResponse.json({ ok: true, emailsSent: sent })
  } catch (e) {
    console.error('[storage-warnings-cron] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
