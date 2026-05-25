/**
 * lib/email.ts — Transactional email via Resend REST API
 *
 * Set RESEND_API_KEY in Vercel env vars to enable.
 * If the key is absent, every call is a no-op (logs a warning).
 *
 * RESEND_FROM   — override the From address (default: noreply@renderfarm-web.vercel.app)
 * NEXT_PUBLIC_BASE_URL — base URL for links in emails (default: https://renderfarm-web.vercel.app)
 */

const API_URL = 'https://api.resend.com/emails'

function getKey()  { return process.env.RESEND_API_KEY  ?? '' }
function getFrom() { return process.env.RESEND_FROM     ?? 'Renderfarm <noreply@renderfarm-web.vercel.app>' }
export  function baseUrl() { return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://renderfarm-web.vercel.app' }

export interface EmailOptions {
  to:      string | string[]
  subject: string
  html:    string
  text?:   string
}

/**
 * Send a transactional email.
 * Never throws — email failures are logged but must not break the main request.
 */
export async function sendEmail(opts: EmailOptions): Promise<void> {
  const key = getKey()
  if (!key) {
    console.warn('[email] RESEND_API_KEY not set — email skipped:', opts.subject)
    return
  }

  try {
    const res = await fetch(API_URL, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    getFrom(),
        to:      Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html:    opts.html,
        ...(opts.text ? { text: opts.text } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[email] Resend error:', res.status, body)
    }
  } catch (err) {
    console.error('[email] Network error sending email:', err)
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

function wrap(content: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f4f4f5; margin: 0; padding: 40px 20px; color: #111; }
  .card { background: #fff; border-radius: 8px; max-width: 520px;
          margin: 0 auto; padding: 36px 40px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
  h2 { margin-top: 0; font-size: 20px; color: #111; }
  p  { line-height: 1.6; color: #444; }
  a.btn { display: inline-block; margin-top: 8px; padding: 12px 24px;
          background: #0d9488; color: #fff; border-radius: 5px;
          text-decoration: none; font-weight: 600; font-size: 15px; }
  .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #999; }
</style></head>
<body>
  <div class="card">${content}</div>
  <div class="footer">Renderfarm Cloud Rendering &nbsp;·&nbsp; <a href="${baseUrl()}" style="color:#999">renderfarm-web.vercel.app</a></div>
</body></html>`
}

export function passwordResetEmail(resetUrl: string) {
  return wrap(`
    <h2>Reset your password</h2>
    <p>We received a request to reset the password for your Renderfarm account.</p>
    <p><a class="btn" href="${resetUrl}">Reset Password</a></p>
    <p style="font-size:13px;color:#888;">
      This link expires in <strong>1 hour</strong>.<br>
      If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
  `)
}

export function supportConfirmEmail(opts: { email: string; subject: string; ticketId: number }) {
  return wrap(`
    <h2>Support request received</h2>
    <p>Hi,</p>
    <p>We've received your support request <strong>#${opts.ticketId}</strong> — <em>${opts.subject}</em>.</p>
    <p>A member of our support team will respond to <strong>${opts.email}</strong> as soon as possible.</p>
    <p><a class="btn" href="${baseUrl()}/support">Submit another request</a></p>
  `)
}

export function jobCompleteEmail(opts: { email: string; jobNumber: string; title: string; frameCount: number }) {
  const url = `${baseUrl()}/jobs/${opts.jobNumber}`
  return wrap(`
    <h2>Job complete: ${opts.jobNumber}</h2>
    <p>Your render job <strong>${opts.title}</strong> has finished.</p>
    <p>${opts.frameCount} frame${opts.frameCount === 1 ? '' : 's'} are ready to download.</p>
    <p><a class="btn" href="${url}">View job &amp; download frames</a></p>
  `)
}
