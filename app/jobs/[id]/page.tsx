'use client'

import { use, useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso))
}

// ── Status display config ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  queued:    '#3b82f6',
  running:   '#22d3ee',
  done:      '#22c55e',
  failed:    '#ef4444',
  holding:   '#f59e0b',   // amber — matches Conductor orange
  uploading: '#a78bfa',
}

const STATUS_LABEL: Record<string, string> = {
  queued:    'Queued',
  running:   'Rendering…',
  done:      'Completed',
  failed:    'Failed',
  holding:   'Holding',
  uploading: 'Uploading',
}

// ── Which job-level actions are valid per status ──────────────────────────────
// Mirrors Conductor: Hold · Kill · Retry · Unhold
const ACTIONS: Record<string, { label: string; next: string; style: string }[]> = {
  queued:  [
    { label: 'Hold',  next: 'holding', style: 'btn-action--warn'   },
    { label: 'Kill',  next: 'failed',  style: 'btn-action--danger' },
  ],
  running: [
    { label: 'Hold',  next: 'holding', style: 'btn-action--warn'   },
    { label: 'Kill',  next: 'failed',  style: 'btn-action--danger' },
  ],
  holding: [
    { label: 'Unhold', next: 'queued', style: 'btn-action--primary' },
    { label: 'Kill',   next: 'failed', style: 'btn-action--danger'  },
  ],
  failed: [
    { label: 'Retry', next: 'queued', style: 'btn-action--primary' },
  ],
  done: [],
  uploading: [
    { label: 'Kill', next: 'failed', style: 'btn-action--danger' },
  ],
}

interface PageProps { params: Promise<{ id: string }> }

export default function JobDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const [job,     setJob]     = useState<ApiJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [acting,  setActing]  = useState(false)

  const load = useCallback(async (silent = false) => {
    try {
      const data = await jobsApi.get(id)
      setJob(data); setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  // Poll every 5 s so status updates live while rendering
  useEffect(() => {
    let cancelled = false
    const loadWrapped = async () => { if (!cancelled) await load() }
    loadWrapped()
    const timer = setInterval(() => { if (!cancelled) load(true) }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [load])

  // ── Action handler (Hold / Unhold / Retry / Kill) ─────────────────────────
  const handleAction = async (nextStatus: string) => {
    if (!job || acting) return
    setActing(true)
    try {
      const token = typeof window !== 'undefined'
        ? localStorage.getItem('rf_token') ?? ''
        : ''
      await fetch(`/api/jobs?id=${job.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      })
      await load(true)
    } catch {
      // silent — next poll will show current state
    } finally {
      setActing(false)
    }
  }

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const breadcrumb = (
    <nav className="job-detail-breadcrumb">
      <Link href="/">Jobs</Link>
      <span>/</span>
      <span className="text-gray-300">Job: {id}</span>
    </nav>
  )

  if (loading) return (
    <div className="flex flex-col gap-6">
      {breadcrumb}
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  if (error || !job) return (
    <div className="flex flex-col gap-6">
      {breadcrumb}
      <p className="text-red-400 text-sm">{error || `Job ${id} not found.`}</p>
    </div>
  )

  const dot     = STATUS_COLOR[job.status] ?? '#888'
  const label   = STATUS_LABEL[job.status] ?? job.status
  const actions = ACTIONS[job.status] ?? []

  // Parse frame range
  const parts = job.frames?.replace(/\s/g, '').split('-') ?? ['1']
  const start = parseInt(parts[0]) || 1
  const end   = parts.length > 1 ? parseInt(parts[1]) || start : start
  const total = end - start + 1
  const done  = job.outputs?.length ?? 0
  const pct   = job.status === 'done'    ? 100
              : job.status === 'running' && total > 0 ? Math.round((done / total) * 100)
              : 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Job</h1>

      <div className="job-detail-card">

        {/* Header — breadcrumb + status badge + action buttons */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          {breadcrumb}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${dot}22`, color: dot, border: `1px solid ${dot}55` }}>
              <span className={`job-status-dot job-status-dot--${job.status}`} />
              {label}
            </div>

            {/* Action buttons */}
            {actions.map(a => (
              <button
                key={a.next}
                type="button"
                className={`btn-action ${a.style}`}
                disabled={acting}
                onClick={() => handleAction(a.next)}
                title={a.label}
              >
                {acting ? '…' : a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Holding banner */}
        {job.status === 'holding' && (
          <div className="holding-banner mb-4">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              <strong>Job is on hold</strong> — a render worker put it on hold because the required
              GPU was not available. Click <strong>Unhold</strong> once a GPU worker is ready,
              or it will be released automatically when a capable worker comes online.
            </span>
          </div>
        )}

        {/* Details grid */}
        <div className="flex flex-col gap-2.5 mb-5">
          {[
            ['Job Number', job.jobNumber],
            ['Title',      job.title],
            ['Software',   job.software],
            ['Frames',     job.frames],
            ['Submitted',  fmtDate(job.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-4 flex-wrap">
              <span className="job-detail-meta-label w-28">{k}:</span>
              <span className="job-detail-meta-value">{v}</span>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Render progress</span>
            <span>{done} / {total} frames ({pct}%)</span>
          </div>
          <div className="job-progress-track">
            <div className={`job-progress-fill job-progress-fill--${job.status}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        <hr className="job-detail-divider" />

        {/* Output frames */}
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Output Frames {job.outputs?.length ? `(${job.outputs.length})` : ''}
          </h3>

          {job.status === 'queued' && (
            <p className="text-gray-500 text-sm">Waiting for a render worker to pick up this job…</p>
          )}
          {job.status === 'uploading' && (
            <p className="text-purple-400 text-sm">Blender is uploading assets — job will be queued once complete.</p>
          )}
          {job.status === 'running' && (
            <p className="text-gray-400 text-sm">Rendering in progress — frames will appear here as they complete.</p>
          )}
          {job.status === 'holding' && (
            <p className="text-amber-400 text-sm">On hold — waiting for a GPU-capable render worker.</p>
          )}
          {job.status === 'failed' && (
            <p className="text-red-400 text-sm">Render failed. Check the worker logs, then click Retry.</p>
          )}
          {job.status === 'done' && (!job.outputs?.length) && (
            <p className="text-gray-500 text-sm">No output frames recorded.</p>
          )}
          {job.outputs && job.outputs.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {job.outputs.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="text-blue-400 hover:underline text-sm font-mono truncate max-w-xs"
                  title={url}>
                  Frame {start + i}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
