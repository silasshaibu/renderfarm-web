'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso))
}

const STATUS_COLOR: Record<string, string> = {
  queued:  '#3b82f6',
  running: '#22d3ee',
  done:    '#22c55e',
  failed:  '#ef4444',
}

const STATUS_LABEL: Record<string, string> = {
  queued:  'Queued',
  running: 'Rendering…',
  done:    'Completed',
  failed:  'Failed',
}

interface PageProps { params: Promise<{ id: string }> }

export default function JobDetailPage({ params }: PageProps) {
  const { id } = use(params)   // id is the jobNumber e.g. "RF-0005"
  const [job,     setJob]     = useState<ApiJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // Poll every 5 s so status updates live while rendering
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await jobsApi.get(id)
        if (!cancelled) { setJob(data); setError('') }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load job')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [id])

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

  const dot   = STATUS_COLOR[job.status] ?? '#888'
  const label = STATUS_LABEL[job.status] ?? job.status

  // Parse frame range
  const parts = job.frames?.replace(/\s/g, '').split('-') ?? ['1']
  const start = parseInt(parts[0]) || 1
  const end   = parts.length > 1 ? parseInt(parts[1]) || start : start
  const total = end - start + 1
  const done  = job.outputs?.length ?? 0
  const pct   = job.status === 'done' ? 100
              : job.status === 'running' && total > 0 ? Math.round((done / total) * 100)
              : 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Job</h1>

      <div className="job-detail-card">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          {breadcrumb}
          <div className="flex items-center gap-2">
            <span className={`job-status-dot job-status-dot--${job.status}`} />
            <span className="text-sm font-medium text-gray-200">{label}</span>
          </div>
        </div>

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
          {job.status === 'running' && (
            <p className="text-gray-400 text-sm">Rendering in progress — frames will appear here as they complete.</p>
          )}
          {job.status === 'failed' && (
            <p className="text-red-400 text-sm">Render failed. Check the worker logs for details.</p>
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
