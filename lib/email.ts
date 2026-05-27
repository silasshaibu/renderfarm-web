/**
 * lib/email.ts — Transactional email via Resend REST API
 *
 * Set RESEND_API in Vercel env vars to enable.
 * If the key is absent, every call is a no-op (logs a warning).
 *
 * RESEND_FROM   — override the From address (default: noreply@renderfarm-web.vercel.app)
 * NEXT_PUBLIC_BASE_URL — base URL for links in emails (default: https://renderfarm-web.vercel.app)
 */

const API_URL = 'https://api.resend.com/emails'

function getKey()  { return process.env.RESEND_API  ?? '' }
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
    console.warn('[email] RESEND_API not set — email skipped:', opts.subject)
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

export function userInviteEmail(opts: { email: string; invitedBy: string; setPasswordUrl: string }) {
  return wrap(`
    <h2>You've been invited to Renderfarm</h2>
    <p>Hi,</p>
    <p><strong>${opts.invitedBy}</strong> has invited <strong>${opts.email}</strong> to join the Renderfarm cloud rendering platform.</p>
    <p>Click the button below to set your password and activate your account:</p>
    <p><a class="btn" href="${opts.setPasswordUrl}">Set Password &amp; Activate Account</a></p>
    <p style="font-size:13px;color:#888;">
      This invitation link expires in <strong>24 hours</strong>.<br>
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  `)
}

// ── Support ticket emails ──────────────────────────────────────────────────────

const SLA: Record<string, string> = {
  critical: '2 hours',
  high:     '4 hours',
  medium:   '1 business day',
  low:      '2 business days',
}

export function ticketConfirmEmail(opts: {
  email: string; ticketNumber: string; subject: string; priority: string
}) {
  const sla = SLA[opts.priority.toLowerCase()] ?? '1–2 business days'
  const url = `${baseUrl()}/support`
  return wrap(`
    <h2>Support Ticket Received</h2>
    <p>Hi,</p>
    <p>We've received your support ticket <strong>${opts.ticketNumber}</strong>:</p>
    <p style="background:#f8f8f8;border-left:3px solid #0d9488;padding:10px 14px;border-radius:3px;font-style:italic;">
      ${opts.subject}
    </p>
    <p>We'll respond to <strong>${opts.email}</strong> within <strong>${sla}</strong>.</p>
    <p><a class="btn" href="${url}">View My Tickets</a></p>
    <p style="font-size:13px;color:#888;">
      You can view your ticket history and add replies at any time by logging into your dashboard.
    </p>
  `)
}

export function ticketNotifyAdminEmail(opts: {
  adminEmail: string; ticketNumber: string; subject: string
  priority: string; category: string; description: string
  userEmail: string; jobId?: string
}) {
  const url = `${baseUrl()}/admin?tab=support`
  return wrap(`
    <h2>[${opts.priority.toUpperCase()}] New Support Ticket: ${opts.subject}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:4px 8px;color:#888;width:130px;">Ticket #</td><td style="padding:4px 8px;font-weight:600;">${opts.ticketNumber}</td></tr>
      <tr><td style="padding:4px 8px;color:#888;">From</td><td style="padding:4px 8px;">${opts.userEmail}</td></tr>
      <tr><td style="padding:4px 8px;color:#888;">Category</td><td style="padding:4px 8px;">${opts.category}</td></tr>
      <tr><td style="padding:4px 8px;color:#888;">Priority</td><td style="padding:4px 8px;">${opts.priority}</td></tr>
      ${opts.jobId ? `<tr><td style="padding:4px 8px;color:#888;">Job ID</td><td style="padding:4px 8px;font-family:monospace;">${opts.jobId}</td></tr>` : ''}
    </table>
    <p style="margin-top:16px;font-weight:600;">Description:</p>
    <p style="background:#f8f8f8;border-left:3px solid #e53e3e;padding:10px 14px;border-radius:3px;white-space:pre-wrap;">${opts.description}</p>
    <p><a class="btn" href="${url}">View in Admin Panel</a></p>
  `)
}

export function ticketReplyToUserEmail(opts: {
  email: string; ticketNumber: string; subject: string; replyText: string
}) {
  const url = `${baseUrl()}/support`
  return wrap(`
    <h2>Reply to your ticket ${opts.ticketNumber}</h2>
    <p>The support team has replied to your ticket: <strong>${opts.subject}</strong></p>
    <p style="background:#f0f9ff;border-left:3px solid #0d9488;padding:10px 14px;border-radius:3px;white-space:pre-wrap;">${opts.replyText}</p>
    <p><a class="btn" href="${url}">View Ticket & Reply</a></p>
  `)
}

export function ticketReplyToAdminEmail(opts: {
  adminEmail: string; ticketNumber: string; subject: string
  replyText: string; userEmail: string
}) {
  const url = `${baseUrl()}/admin?tab=support`
  return wrap(`
    <h2>User replied to ticket ${opts.ticketNumber}</h2>
    <p>From: <strong>${opts.userEmail}</strong></p>
    <p>Ticket: <strong>${opts.subject}</strong></p>
    <p style="background:#f8f8f8;border-left:3px solid #6366f1;padding:10px 14px;border-radius:3px;white-space:pre-wrap;">${opts.replyText}</p>
    <p><a class="btn" href="${url}">View in Admin Panel</a></p>
  `)
}

export function ticketResolvedEmail(opts: {
  email: string; ticketNumber: string; subject: string
}) {
  const url = `${baseUrl()}/support`
  return wrap(`
    <h2>Your ticket has been resolved</h2>
    <p>We've marked your ticket <strong>${opts.ticketNumber}</strong> as resolved:</p>
    <p style="background:#f8f8f8;border-left:3px solid #48bb78;padding:10px 14px;border-radius:3px;font-style:italic;">${opts.subject}</p>
    <p>Was your issue resolved? If not, you can re-open your ticket from the dashboard at any time.</p>
    <p><a class="btn" href="${url}">View My Tickets</a></p>
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
