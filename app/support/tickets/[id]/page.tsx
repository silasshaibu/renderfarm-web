'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

// ─── helpers ─────────────────────────────────────────────────────────────────

function tok()    { return typeof window !== 'undefined' ? (localStorage.getItem('rf_token') ?? '') : '' }
function authHdr() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` } }

function isAdmin() {
  if (typeof window === 'undefined') return false
  const token = localStorage.getItem('rf_token') ?? ''
  try { return Boolean(JSON.parse(atob(token.split('.')[1]))?.isAdmin) } catch { return false }
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso))
}

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60)    return 'just now'
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function initials(email: string) {
  return email ? email[0].toUpperCase() : '?'
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
    open:            'ticket-status-open',
    in_progress:     'ticket-status-inprogress',
    waiting_on_user: 'ticket-status-waiting',
    resolved:        'ticket-status-resolved',
    closed:          'ticket-status-closed',
  }
  const labels: Record<string, string> = {
    open: 'Open', in_progress: 'In Progress',
    waiting_on_user: 'Waiting on User', resolved: 'Resolved', closed: 'Closed',
  }
  return <span className={`ticket-badge ${cls[s] ?? 'ticket-status-closed'}`}>{labels[s] ?? s}</span>
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Reply {
  id:         number
  isSupport:  boolean
  isInternal: boolean
  message:    string
  userEmail:  string
  createdAt:  string
}

interface TicketDetail {
  id:           number
  ticketNumber: string
  email:        string
  subject:      string
  category:     string
  priority:     string
  description:  string
  status:       string
  jobId:        string
  createdAt:    string
  updatedAt:    string
  resolvedAt:   string | null
  replies:      Reply[]
}

// ─── Reply bubble ─────────────────────────────────────────────────────────────

function ReplyBubble({ reply, userEmail }: { reply: Reply; userEmail: string }) {
  const isMe = !reply.isSupport
  return (
    <div className={`flex gap-3 ${reply.isSupport ? 'flex-row-reverse' : 'flex-row'} ${reply.isInternal ? 'opacity-90' : ''}`}>
      {/* Avatar */}
      <div className={`thread-avatar ${reply.isSupport ? 'thread-avatar--support' : 'thread-avatar--user'}`}>
        {reply.isSupport ? '⚙' : initials(reply.userEmail || userEmail)}
      </div>

      <div className={`flex flex-col gap-1 max-w-lg ${reply.isSupport ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={reply.isSupport ? 'text-blue-400 font-medium' : ''}>
            {reply.isSupport ? 'Support Team' : (reply.userEmail || userEmail)}
          </span>
          {reply.isInternal && (
            <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.5 rounded">
              Internal Note
            </span>
          )}
          <span title={fmtDate(reply.createdAt)}>{relTime(reply.createdAt)}</span>
        </div>
        <div className={`thread-bubble ${
          reply.isInternal      ? 'thread-bubble--internal' :
          reply.isSupport       ? 'thread-bubble--support'  :
          'thread-bubble--user'
        }`}>
          {reply.message.split('\n').map((line, i) => (
            <p key={i} className={line === '' ? 'mt-2' : ''}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [ticket,   setTicket]   = useState<TicketDetail | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [reply,    setReply]    = useState('')
  const [internal, setInternal] = useState(false)
  const [sending,  setSending]  = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const admin = typeof window !== 'undefined' ? isAdmin() : false
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${id}`, { headers: authHdr() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setTicket(await res.json() as TicketDetail)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load ticket')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Scroll to bottom of thread on new reply
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [ticket?.replies.length])

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method:  'POST',
        headers: authHdr(),
        body:    JSON.stringify({ message: reply.trim(), isInternal: internal }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const newReply = await res.json() as Reply
      setTicket(prev => prev ? { ...prev, replies: [...prev.replies, newReply] } : prev)
      setReply('')
    } catch { /* ignore */ }
    finally { setSending(false) }
  }

  const updateStatus = async (status: string) => {
    setStatusUpdating(true)
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method:  'PATCH',
        headers: authHdr(),
        body:    JSON.stringify({ status }),
      })
      if (res.ok) setTicket(prev => prev ? { ...prev, status } : prev)
    } catch { /* ignore */ }
    finally { setStatusUpdating(false) }
  }

  if (loading) return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Link href="/support" className="docs-back">← My Tickets</Link>
      <p className="text-sm text-gray-600 py-8 text-center">Loading…</p>
    </div>
  )

  if (error || !ticket) return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <Link href="/support" className="docs-back">← My Tickets</Link>
      <p className="text-sm text-red-400">{error || 'Ticket not found'}</p>
    </div>
  )

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed'

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Back */}
      <Link href="/support" className="docs-back">← My Tickets</Link>

      {/* Header card */}
      <div className="ticket-section-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-mono text-gray-500 mb-1">{ticket.ticketNumber}</p>
            <h1 className="text-lg font-semibold text-gray-100">{ticket.subject}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <StatusBadge s={ticket.status} />
              <PriorityBadge p={ticket.priority} />
              <span className="text-xs text-gray-600 bg-white/5 px-2 py-0.5 rounded">{ticket.category}</span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Submitted {fmtDate(ticket.createdAt)} by {ticket.email}
              {ticket.jobId && (
                <> · Job: <Link href={`/jobs/${ticket.jobId}`} className="text-blue-400 hover:underline font-mono">{ticket.jobId}</Link></>
              )}
            </p>
          </div>

          {/* Admin status controls */}
          {admin && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600">Status:</span>
              {(['open','in_progress','waiting_on_user','resolved','closed'] as const).map(s => (
                <button key={s} type="button" disabled={statusUpdating || ticket.status === s}
                  onClick={() => updateStatus(s)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    ticket.status === s
                      ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                      : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                  }`}>
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resolved banner */}
      {isResolved && (
        <div className="flex items-center justify-between gap-4 bg-green-500/10 border border-green-500/25 rounded-lg px-4 py-3">
          <p className="text-sm text-green-400">✓ This ticket has been marked as resolved.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => updateStatus('open')}
              className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors">
              Re-open Ticket
            </button>
            {ticket.status !== 'closed' && (
              <button type="button" onClick={() => updateStatus('closed')}
                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors">
                Close Ticket
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message thread */}
      <div className="ticket-section-card flex flex-col gap-5">
        {/* Original message */}
        <div className="flex gap-3">
          <div className="thread-avatar thread-avatar--user">{initials(ticket.email)}</div>
          <div className="flex flex-col gap-1 max-w-lg">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{ticket.email}</span>
              <span title={fmtDate(ticket.createdAt)}>{relTime(ticket.createdAt)}</span>
            </div>
            <div className="thread-bubble thread-bubble--user">
              {ticket.description.split('\n').map((line, i) => (
                <p key={i} className={line === '' ? 'mt-2' : ''}>{line}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Thread separator */}
        {ticket.replies.length > 0 && (
          <div className="border-t border-white/6" />
        )}

        {/* Replies */}
        {ticket.replies.map(r => (
          <ReplyBubble key={r.id} reply={r} userEmail={ticket.email} />
        ))}

        <div ref={bottomRef} />

        {/* Reply form */}
        {!isResolved || admin ? (
          <form onSubmit={sendReply} className="flex flex-col gap-3 pt-2 border-t border-white/6">
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder={admin ? 'Write a reply or internal note…' : 'Add a reply…'}
              rows={4}
              className="calc-input px-3 py-2 text-sm w-full resize-y ticket-description-area"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {admin && (
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                    <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)}
                      className="w-3.5 h-3.5 rounded" />
                    Internal note (not visible to user)
                  </label>
                )}
              </div>
              <button type="submit" disabled={sending || !reply.trim()}
                className="admin-btn-primary px-5 py-1.5 text-sm disabled:opacity-40">
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-gray-600 pt-2 border-t border-white/6 text-center">
            This ticket is closed. <button type="button" onClick={() => updateStatus('open')} className="text-blue-400 hover:underline">Re-open</button> to add a reply.
          </p>
        )}
      </div>
    </div>
  )
}
