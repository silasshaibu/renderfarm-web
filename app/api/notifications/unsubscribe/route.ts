import { NextRequest, NextResponse } from 'next/server'
import { sql, initDB } from '@/lib/db'
import { verifyUnsubToken } from '@/lib/notifications'
import { baseUrl } from '@/lib/email'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? ''

  const userId = verifyUnsubToken(token)
  if (!userId) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;">
        <h2>Invalid or expired unsubscribe link</h2>
        <p><a href="${baseUrl()}/profile">Manage notifications in your profile</a></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    )
  }

  await initDB()
  await sql`
    UPDATE users
    SET notify_job_completed = FALSE, notify_job_failed = FALSE
    WHERE id = ${userId}
  `.catch(() => null)

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed — Renderfarm</title>
<style>
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
         background:#f4f4f5;margin:0;padding:60px 20px;color:#111;text-align:center; }
  .card { background:#fff;border-radius:8px;max-width:480px;margin:0 auto;
          padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06); }
  h2 { color:#111;margin-top:0; }
  p  { color:#555;line-height:1.7; }
  a  { color:#0d9488;text-decoration:none;font-weight:600; }
</style></head>
<body>
  <div class="card">
    <div style="font-size:40px;margin-bottom:16px;">✓</div>
    <h2>You've been unsubscribed</h2>
    <p>You will no longer receive job completion notification emails from Renderfarm.</p>
    <p>You can re-enable notifications at any time in your
       <a href="${baseUrl()}/profile">profile settings</a>.</p>
  </div>
</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
