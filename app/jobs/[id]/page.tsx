'use client'

import { use, useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'
import { getToken, getUser } from '@/lib/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

function padTask(n: number) { return String(n).padStart(3, '0') }

// ── Status config ─────────────────────────────────────────────────────────────
// Maps raw API status → globe CSS suffix, display label, text colour
const STATUS_CFG: Record<string, { globe: string; label: string; color: string }> = {
  queued:    { globe: 'queued',     label: 'queued',    color: '#60a5fa' },
  running:   { globe: 'running',    label: 'running',   color: '#fbbf24' },
  done:      { globe: 'downloaded', label: 'done',      color: '#4ade80' },
  failed:    { globe: 'failed',     label: 'failed',    color: '#f87171' },
  holding:   { globe: 'holding',    label: 'holding',   color: '#fbbf24' },
  uploading: { globe: 'uploading',  label: 'uploading', color: '#c084fc' },
}

// ── Action buttons per job status (Hold / Unhold / Retry / Kill) ──────────────
const ACTIONS: Record<string, { label: string; next: string; style: string }[]> = {
  queued:    [{ label: 'Hold', next: 'holding', style: 'btn-action--warn' }, { label: 'Kill', next: 'failed', style: 'btn-action--danger' }],
  running:   [{ label: 'Hold', next: 'holding', style: 'btn-action--warn' }, { label: 'Kill', next: 'failed', style: 'btn-action--danger' }],
  holding:   [{ label: 'Unhold', next: 'queued', style: 'btn-action--primary' }, { label: 'Kill', next: 'failed', style: 'btn-action--danger' }],
  failed:    [{ label: 'Retry', next: 'queued', style: 'btn-action--primary' }],
  done:      [],
  uploading: [{ label: 'Kill', next: 'failed', style: 'btn-action--danger' }],
}

// ── Derive per-frame task status ──────────────────────────────────────────────
type TaskStatus = 'done' | 'running' | 'failed' | 'holding' | 'pending'

function frameStatus(jobStatus: string, frameIdx: number, outputs: string[]): TaskStatus {
  if (jobStatus === 'done')      return 'done'
  if (jobStatus === 'failed')    return 'failed'
  if (jobStatus === 'holding')   return 'holding'
  if (jobStatus === 'queued' || jobStatus === 'uploading') return 'pending'
  // running: frames with output URL are done, next one is running, rest are pending
  if (outputs[frameIdx])         return 'done'
  if (frameIdx === outputs.length) return 'running'
  return 'pending'
}

// ── Task table row ────────────────────────────────────────────────────────────
function TaskStatusCell({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    done:    'done', running: 'running', failed: 'failed',
    holding: 'holding', pending: 'pending',
  }
  return (
    <span className={`task-status task-status--${status}`}>
      <span className="task-status-dot" />
      {labels[status]}
    </span>
  )
}

// ── Page props ────────────────────────────────────────────────────────────────
interface PageProps { params: Promise<{ id: string }> }

const TASK_PAGE_SIZE = 10

export default function JobDetailPage({ params }: PageProps) {
  const { id } = use(params)   // id is the jobNumber e.g. "RF-0005"

  const [job,      setJob]      = useState<ApiJob | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [acting,   setActing]   = useState(false)
  const [taskPage, setTaskPage] = useState(1)
  const [selTask,  setSelTask]  = useState<number | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    let cancelled = false
    const run = async () => { if (!cancelled) await load() }
    run()
    const timer = setInterval(() => { if (!cancelled) load(true) }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [load])

  // ── Action handler ──────────────────────────────────────────────────────────
  const handleAction = async (nextStatus: string) => {
    if (!job || acting) return
    setActing(true)
    try {
      const token = getToken() ?? ''
      await fetch(`/api/jobs?id=${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      await load(true)
    } catch { /* next poll will reflect server state */ }
    finally { setActing(false) }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const user    = getUser()
  const cfg     = STATUS_CFG[job?.status ?? ''] ?? { globe: 'pending', label: job?.status ?? '', color: '#9ca3af' }
  const actions = ACTIONS[job?.status ?? ''] ?? []

  const { frames, start, end, total, done, pct } = useMemo(() => {
    const framesStr = job?.frames ?? '1-1'
    const parts  = framesStr.replace(/\s/g, '').split('-')
    const start  = parseInt(parts[0]) || 1
    const end    = parts.length > 1 ? parseInt(parts[1]) || start : start
    const total  = Math.max(1, end - start + 1)
    const done   = job?.outputs?.length ?? 0
    const pct    = job?.status === 'done' ? 100
                 : job?.status === 'running' && total > 0 ? Math.round((done / total) * 100)
                 : 0
    return { frames: framesStr, start, end, total, done, pct }
  }, [job])

  // ── Task pagination ─────────────────────────────────────────────────────────
  const totalTaskPages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE))
  const taskStart      = (taskPage - 1) * TASK_PAGE_SIZE
  const taskEnd        = Math.min(taskStart + TASK_PAGE_SIZE, total)
  const taskIndices    = Array.from({ length: taskEnd - taskStart }, (_, i) => taskStart + i)

  // ── Manifest extras ─────────────────────────────────────────────────────────
  const manifest     = (job as (ApiJob & { manifest?: Record<string, unknown> }) | null)?.manifest ?? {}
  const machineType  = (manifest.machine_type as string | undefined) ?? '—'
  const instanceType = (manifest.instance_type as string | undefined) ?? '—'
  const renderer     = (manifest.renderer as string | undefined) ?? '—'

  // ── Loading / error states ──────────────────────────────────────────────────
  const breadcrumb = (
    <nav className="job-detail-breadcrumb">
      <Link href="/">Jobs</Link>
      <span>/</span>
      <span className="text-gray-400">Job: {id}</span>
    </nav>
  )

  if (loading) return (
    <div className="flex flex-col gap-4">
      {breadcrumb}
      <p className="text-gray-500 text-sm py-16 text-center">Loading…</p>
    </div>
  )

  if (error || !job) return (
    <div className="flex flex-col gap-4">
      {breadcrumb}
      <p className="text-red-400 text-sm">{error || `Job ${id} not found.`}</p>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Job</h1>

      <div className="job-detail-card">

        {/* ── Top row: breadcrumb left · globe + status + actions right ──── */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          {breadcrumb}

          <div className="flex items-center gap-3 flex-wrap">
            {/* Action buttons */}
            {actions.map(a => (
              <button key={a.next} type="button"
                className={`btn-action ${a.style}`}
                disabled={acting}
                onClick={() => handleAction(a.next)}>
                {acting ? '…' : a.label}
              </button>
            ))}

            {/* Status globe + label — matches Conductor top-right */}
            <div className="flex items-center gap-2.5">
              <div className={`job-status-globe job-status-globe-${cfg.globe}`} />
              <span className={`text-lg font-semibold job-status-label-${job.status}`}>
                {cfg.label}
              </span>
            </div>
          </div>
        </div>

        {/* ── User / project / instance row ────────────────────────────── */}
        <div className="job-meta-row">
          {/* User */}
          <div className="job-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span>{user?.email?.split('@')[0] ?? 'Administrator'}</span>
          </div>
          {/* Project */}
          <div className="job-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>Default</span>
          </div>
          {/* Instance chip */}
          {machineType !== '—' && (
            <div className="job-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span className="job-instance-chip">{instanceType} · {machineType}</span>
            </div>
          )}
        </div>

        {/* ── Metadata fields ───────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 mb-5">
          {[
            ['Job Title',       job.title],
            ['Output Path',     '—'],
            ['Software',        job.software ?? '—'],
            ['Renderer',        renderer],
            ['Frames',          frames],
            ['Submitted',       fmtDate(job.createdAt)],
            ['Status Description', job.status === 'holding'
              ? 'Waiting for a GPU-capable render worker'
              : ''],
          ].map(([k, v]) => v ? (
            <div key={k} className="flex gap-4 flex-wrap">
              <span className="job-detail-meta-label">{k}:</span>
              <span className="job-detail-meta-value">{v}</span>
            </div>
          ) : null)}
        </div>

        {/* ── Holding banner ────────────────────────────────────────────── */}
        {job.status === 'holding' && (
          <div className="holding-banner mb-4">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              <strong>Job is on hold</strong> — the render worker detected no GPU on this machine.
              Click <strong>Unhold</strong> once a GPU-capable worker comes online, or it will
              be released automatically when one does.
            </span>
          </div>
        )}

        {/* ── Render progress bar ───────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Render progress</span>
            <span>{done} / {total} frames ({pct}%)</span>
          </div>
          <div className="job-progress-track">
            <div className={`job-progress-fill job-progress-fill--${job.status}`}
              style={{ '--fill-width': `${pct}%` } as React.CSSProperties} />
          </div>
        </div>

        <hr className="job-detail-divider" />

        {/* ── Task table ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">
            Tasks <span className="text-gray-500 font-normal">({total})</span>
          </h3>
          <span className="text-xs text-gray-500">
            Showing {taskStart + 1}–{taskEnd} of {total}
          </span>
        </div>

        <div className="job-task-wrap mb-3">
          <table className="job-task-table">
            <thead>
              <tr>
                <th className="job-task-th">TASK ID</th>
                <th className="job-task-th">FRAME</th>
                <th className="job-task-th">STATUS</th>
                <th className="job-task-th right">CORES</th>
                <th className="job-task-th right">MEMORY</th>
                <th className="job-task-th center">PREEMPTIBLE</th>
                <th className="job-task-th right">ELAPSED</th>
                <th className="job-task-th right">START TIME</th>
                <th className="job-task-th right">END TIME</th>
              </tr>
            </thead>
            <tbody>
              {taskIndices.map((idx) => {
                const frameNum = start + idx
                const tStatus  = frameStatus(job.status, idx, job.outputs ?? [])
                const outputUrl = job.outputs?.[idx]
                const isSelected = selTask === idx

                return (
                  <tr key={idx}
                    className={`job-task-row ${isSelected ? 'job-task-row--selected' : ''}`}
                    onClick={() => setSelTask(isSelected ? null : idx)}>

                    <td className="job-task-td">
                      {outputUrl
                        ? <a href={outputUrl} target="_blank" rel="noreferrer"
                            className="text-blue-400 hover:underline"
                            onClick={e => e.stopPropagation()}>
                            {padTask(idx)}
                          </a>
                        : padTask(idx)
                      }
                    </td>
                    <td className="job-task-td">{frameNum}</td>
                    <td className="job-task-td"><TaskStatusCell status={tStatus} /></td>
                    <td className="job-task-td right">4</td>
                    <td className="job-task-td right">16 GB</td>
                    <td className="job-task-td center">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-xs border bg-blue-500/20 border-blue-500/40 text-blue-400">✓</span>
                    </td>
                    <td className="job-task-td right text-gray-500">
                      {tStatus === 'done' ? '—' : '—'}
                    </td>
                    <td className="job-task-td right text-gray-500">—</td>
                    <td className="job-task-td right text-gray-500">—</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Task pagination */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            Showing <span className="text-gray-300">{taskStart + 1}–{taskEnd}</span> of{' '}
            <span className="text-gray-300">{total}</span> entries
          </span>
          <nav className="flex items-center gap-2">
            <button type="button"
              className="px-3 py-1.5 rounded text-xs border border-white/10 text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed"
              disabled={taskPage === 1}
              onClick={() => setTaskPage(p => p - 1)}>
              Previous
            </button>
            <span className="flex items-center gap-1.5">
              Page
              <input type="number" min={1} max={totalTaskPages}
                value={taskPage} aria-label="Task page"
                onChange={e => {
                  const v = Number(e.target.value)
                  if (v >= 1 && v <= totalTaskPages) setTaskPage(v)
                }}
                className="table-input w-12 px-2 py-1 text-center text-gray-200 text-xs"
              />
              of {totalTaskPages}
            </span>
            <button type="button"
              className="px-3 py-1.5 rounded text-xs border border-white/10 text-gray-400 hover:text-white disabled:text-gray-700 disabled:cursor-not-allowed"
              disabled={taskPage === totalTaskPages}
              onClick={() => setTaskPage(p => p + 1)}>
              Next
            </button>
          </nav>
        </div>

      </div>
    </div>
  )
}
