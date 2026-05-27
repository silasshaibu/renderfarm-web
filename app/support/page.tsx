'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ─── helpers ─────────────────────────────────────────────────────────────────

function tok() { return typeof window !== 'undefined' ? (localStorage.getItem('rf_token') ?? '') : '' }
function authHdr() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` } }

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function fullDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso))
}

const SLA: Record<string, string> = {
  critical: '2 hours',
  high:     '4 hours',
  medium:   '1 business day',
  low:      '2 business days',
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function PriorityBadge({ p }: { p: string }) {
  const cls: Record<string, string> = {
    critical: 'ticket-badge-critical',
    high:     'ticket-badge-high',
    medium:   'ticket-badge-medium',
    low:      'ticket-badge-low',
  }
  return <span className={`ticket-badge ${cls[p.toLowerCase()] ?? 'ticket-badge-low'}`}>{p}</span>
}

function StatusBadge({ s }: { s: string }) {
  const cls: Record<string, string> = {
    open:             'ticket-status-open',
    in_progress:      'ticket-status-inprogress',
    waiting_on_user:  'ticket-status-waiting',
    resolved:         'ticket-status-resolved',
    closed:           'ticket-status-closed',
  }
  const labels: Record<string, string> = {
    open: 'Open', in_progress: 'In Progress',
    waiting_on_user: 'Waiting', resolved: 'Resolved', closed: 'Closed',
  }
  return <span className={`ticket-badge ${cls[s] ?? 'ticket-status-closed'}`}>{labels[s] ?? s}</span>
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, ok ? 5000 : 7000); return () => clearTimeout(t) }, [ok, onDismiss])
  return (
    <div className={`ticket-toast ${ok ? 'ticket-toast--ok' : 'ticket-toast--err'}`}>
      {msg}
    </div>
  )
}

// ─── Accordion ───────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'My job is stuck in "syncing"',
    a: `Syncing transfers your files to cloud storage before rendering begins. Large scenes can take several minutes.\n\nIf syncing takes more than 30 minutes:\n1. Check your internet connection speed\n2. Try cancelling and resubmitting the job\n3. Enable the Syncer Wrangler in Virtual Wrangler settings\n4. If the issue persists, submit a support ticket with your job ID`,
  },
  {
    q: 'My job failed with an error',
    a: `1. Navigate to Jobs → click your failed job\n2. Click on the failed task → expand "Task Logs"\n3. Look for error messages (usually in red)\n4. Common causes:\n   · Missing textures: add them via Extra Assets in the Blender submitter\n   · Wrong Blender version: ensure the version matches your scene\n   · Memory error: try a machine with more RAM\n5. If you can't identify the cause, submit a ticket with the job ID and error log`,
  },
  {
    q: 'My frames look wrong / render quality issues',
    a: `1. Use Scout Frames to preview before rendering all frames\n2. Check your render settings match your local settings\n3. Resolution and sample overrides in the submitter take priority over scene settings\n4. If using Cycles: ensure a GPU instance is selected\n5. Submit a ticket with the job ID and example frame screenshots`,
  },
  {
    q: 'I was charged but my job didn\'t complete',
    a: `Charges are based on core-hours of compute time used, even if a job fails partway through.\n\nTo minimize costs:\n1. Use Scout Frames to verify settings before full render\n2. Use Cost Limits in Admin to cap spending\n3. If you believe there was a billing error, submit a ticket with Category: "Billing & Payments" and your job ID`,
  },
  {
    q: 'The Blender addon won\'t connect',
    a: `1. Check you are using the correct credentials for renderfarm.swade-art.com\n2. Ensure the addon is enabled in Blender Preferences\n3. Check your internet connection\n4. Try clicking Connect again — the first attempt sometimes times out\n5. Check Admin → Sessions to see if your session was created successfully`,
  },
  {
    q: 'My output files are missing',
    a: `1. Check Admin → Storage to verify storage hasn't been purged\n2. Verify your Output Path in the job's submission settings\n3. Output files are stored temporarily — download them promptly after job completion\n4. Use the Companion App downloader for bulk downloads`,
  },
]

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ticket-accordion-item">
      <button type="button" className="ticket-accordion-trigger" onClick={() => setOpen(v => !v)}>
        <span className="text-sm font-medium text-gray-200">{q}</span>
        <span className={`ticket-accordion-chevron ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="ticket-accordion-body">
          {a.split('\n').map((line, i) => (
            <p key={i} className={`text-sm text-gray-400 leading-relaxed ${line === '' ? 'mt-2' : ''}`}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section 1: Submit form ───────────────────────────────────────────────────

interface Ticket {
  id: number; ticketNumber: string; email: string; subject: string
  category: string; priority: string; status: string
  createdAt: string; updatedAt: string; jobId?: string
}

const CATEGORIES = [
  'Billing & Payments', 'Job Failed / Error', 'Slow Rendering',
  'Upload / Sync Issue', 'Account Access', 'Blender Addon Issue',
  'Feature Request', 'Other',
]

const PRIORITIES = [
  { value: 'low',      label: 'Low',      desc: 'General question or feature request',      dot: 'bg-gray-400' },
  { value: 'medium',   label: 'Medium',   desc: 'Issue affecting work but workaround exists', dot: 'bg-blue-400' },
  { value: 'high',     label: 'High',     desc: 'Issue blocking active production',           dot: 'bg-orange-400' },
  { value: 'critical', label: 'Critical', desc: 'Complete outage, no workaround',             dot: 'bg-red-500' },
]

function SubmitForm({ onSubmitted }: { onSubmitted: (t: Ticket) => void }) {
  const [subject,     setSubject]     = useState('')
  const [category,    setCategory]    = useState('Job Failed / Error')
  const [priority,    setPriority]    = useState('medium')
  const [description, setDescription] = useState('')
  const [jobId,       setJobId]       = useState('')
  const [files,       setFiles]       = useState<File[]>([])
  const [submitting,  setSubmitting]  = useState(false)
  const [success,     setSuccess]     = useState<{ num: string; sla: string } | null>(null)
  const [error,       setError]       = useState('')

  // Auto-fill job_id from URL ?job_id=RF-0014
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const j = p.get('job_id')
    if (j) setJobId(j)
  }, [])

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    const valid = selected.filter(f => f.size <= 10 * 1024 * 1024)
    setFiles(prev => [...prev, ...valid].slice(0, 3))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.'); return
    }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/support/tickets', {
        method:  'POST',
        headers: authHdr(),
        body:    JSON.stringify({ subject, category, priority, description, jobId: jobId || undefined }),
      })
      const data = await res.json() as { id: number; ticketNumber: string; message?: string }
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)

      setSuccess({ num: data.ticketNumber, sla: SLA[priority] ?? '1–2 business days' })
      onSubmitted({ id: data.id, ticketNumber: data.ticketNumber, email: '', subject, category, priority, status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), jobId })
      // Clear form
      setSubject(''); setCategory('Job Failed / Error'); setPriority('medium')
      setDescription(''); setJobId(''); setFiles([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return (
    <div className="ticket-section-card">
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center text-green-400 text-2xl">✓</div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-200">{success.num} submitted successfully</p>
          <p className="text-sm text-gray-400 mt-1">We&apos;ll respond within <strong className="text-gray-200">{success.sla}</strong>.</p>
        </div>
        <button type="button" onClick={() => setSuccess(null)} className="admin-btn-primary px-5 py-2 text-sm">
          Submit Another Ticket
        </button>
      </div>
    </div>
  )

  return (
    <div className="ticket-section-card">
      <h2 className="text-base font-semibold text-gray-200 mb-1">Submit a Support Ticket</h2>
      <p className="text-sm text-gray-500 mb-5">Having an issue? Describe your problem below and our team will get back to you as soon as possible.</p>

      {error && <div className="enterprise-alert-error mb-4 text-sm">{error}</div>}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {/* Subject */}
        <div className="flex flex-col gap-1">
          <label htmlFor="subject" className="text-xs font-semibold text-gray-400">Subject <span className="text-red-500">*</span></label>
          <input id="subject" type="text" required value={subject} onChange={e => setSubject(e.target.value)}
            placeholder="Brief description of your issue"
            className="calc-input px-3 py-2 text-sm w-full" />
        </div>

        {/* Category + Priority in 2 columns */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-xs font-semibold text-gray-400">Category <span className="text-red-500">*</span></label>
            <select id="category" value={category} onChange={e => setCategory(e.target.value)}
              className="calc-input px-3 py-2 text-sm">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="priority" className="text-xs font-semibold text-gray-400">Priority <span className="text-red-500">*</span></label>
            <select id="priority" value={priority} onChange={e => setPriority(e.target.value)}
              className="calc-input px-3 py-2 text-sm">
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label} — {p.desc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-xs font-semibold text-gray-400">Description <span className="text-red-500">*</span></label>
          <textarea id="description" required value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Please describe your issue in detail. Include any error messages, job IDs, or steps to reproduce the problem."
            rows={5}
            className="calc-input px-3 py-2 text-sm w-full resize-y ticket-description-area" />
        </div>

        {/* Job ID */}
        <div className="flex flex-col gap-1">
          <label htmlFor="job-id" className="text-xs font-semibold text-gray-400">Job ID <span className="text-xs font-normal text-gray-600">(optional)</span></label>
          <input id="job-id" type="text" value={jobId} onChange={e => setJobId(e.target.value)}
            placeholder="e.g. RF-0014"
            className="calc-input px-3 py-2 text-sm w-48 font-mono" />
          <p className="text-xs text-gray-600">If your issue relates to a specific job, enter the job ID here.</p>
        </div>

        {/* File attachments */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-400">Attachments <span className="text-xs font-normal text-gray-600">(optional)</span></label>
          <label className="ticket-dropzone cursor-pointer">
            <input type="file" multiple accept=".png,.jpg,.jpeg,.txt,.log,.blend" className="sr-only"
              onChange={handleFiles} />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-500" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span className="text-sm text-gray-500">Attach screenshots or log files (optional)</span>
            <span className="text-xs text-gray-600">Max 10 MB per file · up to 3 files · PNG, JPG, TXT, LOG, BLEND</span>
          </label>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 mt-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-xs text-gray-400 bg-white/5 px-3 py-1.5 rounded">
                  <span>{f.name} <span className="text-gray-600">({(f.size / 1024).toFixed(0)} KB)</span></span>
                  <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}
                    className="text-gray-600 hover:text-red-400">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={submitting}
            className="admin-btn-primary px-6 py-2 text-sm">
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Section 2: My Tickets ────────────────────────────────────────────────────

const PAGE_SIZE = 10

function MyTickets({ freshTicket }: { freshTicket: Ticket | null }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/support/tickets', { headers: authHdr() })
      if (res.ok) setTickets(await res.json() as Ticket[])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Prepend freshly submitted ticket immediately
  useEffect(() => {
    if (!freshTicket) return
    setTickets(prev => {
      if (prev.some(t => t.id === freshTicket.id)) return prev
      return [freshTicket, ...prev]
    })
  }, [freshTicket])

  const total      = tickets.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const slice      = tickets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="ticket-section-card">
      <h2 className="text-base font-semibold text-gray-200 mb-4">My Tickets</h2>

      {loading ? (
        <p className="text-sm text-gray-600 py-6 text-center">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" className="text-gray-700" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p className="text-sm text-gray-600">No support tickets yet. Submit a ticket above if you need help.</p>
        </div>
      ) : (
        <>
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="jobs-thead-row">
                  {['Ticket #', 'Subject', 'Category', 'Priority', 'Status', 'Created', 'Updated'].map(h => (
                    <th key={h} className="jobs-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slice.map(t => (
                  <tr key={t.id} className="jobs-tbody-row">
                    <td className="jobs-td">
                      <Link href={`/support/tickets/${t.id}`} className="font-mono text-xs text-blue-400 hover:underline">
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="jobs-td text-gray-300 max-w-48 truncate">{t.subject}</td>
                    <td className="jobs-td text-xs text-gray-500">{t.category}</td>
                    <td className="jobs-td"><PriorityBadge p={t.priority} /></td>
                    <td className="jobs-td"><StatusBadge s={t.status} /></td>
                    <td className="jobs-td">
                      <span className="text-xs text-gray-500" title={fullDate(t.createdAt)}>{relTime(t.createdAt)}</span>
                    </td>
                    <td className="jobs-td">
                      <span className="text-xs text-gray-500" title={t.updatedAt ? fullDate(t.updatedAt) : ''}>{t.updatedAt ? relTime(t.updatedAt) : '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/5 text-xs text-gray-500">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-1">
                <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-2 py-0.5 rounded border border-gray-700 disabled:opacity-30 hover:bg-white/5">‹</button>
                <button type="button" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-2 py-0.5 rounded border border-gray-700 disabled:opacity-30 hover:bg-white/5">›</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Section 3: Quick Help ────────────────────────────────────────────────────

const HELP_CARDS = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    ),
    title:  'Documentation',
    desc:   'Step-by-step guides for the Blender addon, Virtual Wrangler, and all platform features.',
    btn:    'View Docs',
    href:   '/documentation',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
      </svg>
    ),
    title:  'FAQ',
    desc:   'Answers to the most common questions about billing, jobs, and rendering.',
    btn:    'View FAQ',
    href:   '/documentation/faq',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    ),
    title:  'Check Your Job Logs',
    desc:   'Most render errors are visible in the task logs. Check your failed job\'s logs before submitting.',
    btn:    'View Jobs',
    href:   '/jobs',
  },
]

function QuickHelp() {
  return (
    <div className="ticket-section-card">
      <h2 className="text-base font-semibold text-gray-200 mb-1">Quick Help</h2>
      <p className="text-sm text-gray-500 mb-5">Before submitting a ticket, check these resources:</p>

      {/* 3 cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {HELP_CARDS.map(c => (
          <div key={c.title} className="flex flex-col gap-3 bg-white/[0.03] border border-white/8 rounded-lg p-4">
            <div className="text-blue-400">{c.icon}</div>
            <div>
              <p className="text-sm font-semibold text-gray-200 mb-1">{c.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            </div>
            <Link href={c.href} className="mt-auto inline-flex items-center text-xs font-semibold text-blue-400 hover:underline">
              {c.btn} →
            </Link>
          </div>
        ))}
      </div>

      {/* Accordion */}
      <div className="border-t border-white/7 pt-5">
        <p className="text-sm font-semibold text-gray-300 mb-3">Common Issues &amp; Solutions</p>
        <div className="flex flex-col gap-1">
          {FAQS.map(faq => <AccordionItem key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [freshTicket, setFreshTicket] = useState<Ticket | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const handleSubmitted = (t: Ticket) => {
    setFreshTicket(t)
    setToast({ msg: `✓ ${t.ticketNumber} submitted. We'll respond within ${SLA[t.priority] ?? '1–2 business days'}.`, ok: true })
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Support</h1>
        <p className="mt-1 text-sm text-gray-400">Get help from our team or browse self-service resources.</p>
      </div>

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}

      <SubmitForm onSubmitted={handleSubmitted} />
      <MyTickets freshTicket={freshTicket} />
      <QuickHelp />
    </div>
  )
}
