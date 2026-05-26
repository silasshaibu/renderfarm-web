'use client'

import { use, useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'
import { getToken, getUser } from '@/lib/auth'

// ── Scout Frames modal ────────────────────────────────────────────────────────
function ScoutModal({
  jobNumber, frameStart, frameEnd,
  onClose, onCreated,
}: {
  jobNumber: string; frameStart: number; frameEnd: number
  onClose: () => void; onCreated: (newJobNum: string) => void
}) {
  const [input,   setInput]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const parseFrames = (s: string): number[] => {
    const parts = s.split(',').map(p => p.trim()).filter(Boolean)
    const out: number[] = []
    for (const p of parts) {
      // support "10-20" ranges inline
      if (p.includes('-')) {
        const [a, b] = p.split('-').map(Number)
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = a; i <= b; i++) out.push(i)
          continue
        }
      }
      const n = parseInt(p, 10)
      if (!isNaN(n)) out.push(n)
    }
    return [...new Set(out)].sort((a, b) => a - b)
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleSubmit = async () => {
    setError('')
    const frames = parseFrames(input)
    if (!frames.length) { setError('Enter at least one frame number.'); return }
    const bad = frames.filter(f => f < frameStart || f > frameEnd)
    if (bad.length) { setError(`Frame(s) out of range [${frameStart}–${frameEnd}]: ${bad.join(', ')}`); return }

    setSaving(true)
    try {
      const token = localStorage.getItem('rf_token') ?? ''
      const res = await fetch(`/api/jobs/${jobNumber}/scout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ frames }),
      })
      const json = await res.json() as { jobNumber?: string; message?: string }
      if (!res.ok) { setError(json.message ?? 'Failed to create scout job'); return }
      onCreated(json.jobNumber ?? '')
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const mid = Math.round((frameStart + frameEnd) / 2)
  const example = frameStart === frameEnd
    ? String(frameStart)
    : `${frameStart}, ${mid}, ${frameEnd}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#1a1d23] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-base font-semibold text-white mb-1">Scout Frames</h2>
        <p className="text-xs text-gray-400 mb-4">
          Render a subset of frames first to check quality.
          Creates a new pending job. Range: {frameStart}–{frameEnd}.
        </p>
        <label className="block text-xs font-medium text-gray-300 mb-1" htmlFor="scout-frames">
          Frame numbers <span className="text-gray-500">(comma-separated, or ranges like 10-20)</span>
        </label>
        <input
          id="scout-frames" type="text" placeholder={`e.g. ${example}`}
          value={input} onChange={e => setInput(e.target.value)}
          className="calc-input px-3 py-2 w-full mb-3"
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
        />
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="edit-modal-cancel">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className="edit-modal-ok">
            {saving ? 'Creating…' : 'Create Scout Job'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Per-frame task timing (from tasks table) ──────────────────────────────────
interface TaskTiming {
  status:      string
  startedAt:   string | null
  completedAt: string | null
  outputUrl:   string
  durationSec: number | null
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60)   return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${sec}s`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function padTask(n: number) { return String(n).padStart(3, '0') }

// ── Status config — all 12 Conductor statuses + legacy DB values ──────────────
const STATUS_CFG: Record<string, { globe: string; label: string }> = {
  // Legacy DB names
  queued:         { globe: 'queued',        label: 'queued'         },
  done:           { globe: 'downloaded',    label: 'done'           },
  // All 12 Conductor statuses
  upload_pending: { globe: 'upload_pending', label: 'upload pending' },
  uploading:      { globe: 'uploading',      label: 'uploading'      },
  sync_pending:   { globe: 'sync_pending',   label: 'sync pending'   },
  sync_failed:    { globe: 'sync_failed',    label: 'sync failed'    },
  syncing:        { globe: 'syncing',        label: 'syncing'        },
  pending:        { globe: 'pending',        label: 'pending'        },
  holding:        { globe: 'holding',        label: 'holding'        },
  running:        { globe: 'running',        label: 'running'        },
  success:        { globe: 'success',        label: 'success'        },
  downloaded:     { globe: 'downloaded',     label: 'downloaded'     },
  failed:         { globe: 'failed',         label: 'failed'         },
  killed:         { globe: 'killed',         label: 'killed'         },
  preempted:      { globe: 'preempted',      label: 'preempted'      },
}

// ── Action buttons per job status ─────────────────────────────────────────────
const HOLD   = { label: 'Hold',         next: 'holding',  style: 'btn-action--warn'    }
const UNHOLD = { label: 'Unhold',       next: 'pending',  style: 'btn-action--primary' }
const KILL   = { label: 'Kill',         next: 'killed',   style: 'btn-action--danger'  }
const RETRY  = { label: 'Retry',        next: 'pending',  style: 'btn-action--primary' }
const RSYNC  = { label: 'Retry Sync',   next: 'syncing',  style: 'btn-action--warn'    }

const ACTIONS: Record<string, { label: string; next: string; style: string }[]> = {
  // Legacy
  queued:         [HOLD, KILL],
  done:           [],
  // All 12 Conductor statuses — Kill only on active/in-flight states
  upload_pending: [KILL],
  uploading:      [KILL],
  sync_pending:   [KILL],
  sync_failed:    [RSYNC, KILL],
  syncing:        [KILL],
  pending:        [HOLD, KILL],
  holding:        [UNHOLD, KILL],
  running:        [HOLD, KILL],
  // Terminal states — no Kill (can't kill what's already stopped)
  success:        [],           // succeeded — nothing to do
  downloaded:     [],           // fully done — nothing to do
  failed:         [RETRY],      // failed — try again
  killed:         [RETRY],      // manually killed — can re-queue if needed
  preempted:      [RETRY],      // cloud reclaimed it — try again
}

// ── Per-frame task status ─────────────────────────────────────────────────────
type TaskStatus = 'done' | 'running' | 'failed' | 'holding' | 'pending'

const DONE_STATUSES     = new Set(['done', 'success', 'downloaded'])
const FAILED_STATUSES   = new Set(['failed', 'killed'])
const HOLDING_STATUSES  = new Set(['holding'])
const PENDING_STATUSES  = new Set(['queued', 'uploading', 'upload_pending', 'sync_pending', 'sync_failed', 'syncing', 'pending', 'preempted'])

function frameStatus(jobStatus: string, frameIdx: number, outputs: string[]): TaskStatus {
  if (DONE_STATUSES.has(jobStatus))    return 'done'
  if (FAILED_STATUSES.has(jobStatus))  return 'failed'
  if (HOLDING_STATUSES.has(jobStatus)) return 'holding'
  if (PENDING_STATUSES.has(jobStatus)) return 'pending'
  // running — use outputs array to determine per-frame state
  if (outputs[frameIdx])               return 'done'
  if (frameIdx === outputs.length)     return 'running'
  return 'pending'
}

function TaskStatusCell({ status }: { status: TaskStatus }) {
  return (
    <span className={`task-status task-status--${status}`}>
      <span className="task-status-dot" />
      {status}
    </span>
  )
}

// ── Page props ────────────────────────────────────────────────────────────────
interface PageProps { params: Promise<{ id: string }> }
const TASK_PAGE_SIZE = 10

export default function JobDetailPage({ params }: PageProps) {
  const { id } = use(params)

  const [job,         setJob]         = useState<ApiJob | null>(null)
  const [taskTimings, setTaskTimings] = useState<Record<number, TaskTiming>>({})
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [acting,      setActing]      = useState(false)
  const [taskPage,    setTaskPage]    = useState(1)
  const [selTask,     setSelTask]     = useState<number | null>(null)
  const [showScout,   setShowScout]   = useState(false)
  const [scoutCreated, setScoutCreated] = useState('')

  const loadTimings = useCallback(async (jobId: string) => {
    try {
      const token = getToken() ?? ''
      const res   = await fetch(`/api/jobs/${jobId}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as Record<number, TaskTiming>
        setTaskTimings(data)
      }
    } catch { /* non-critical */ }
  }, [])

  const load = useCallback(async (silent = false) => {
    try {
      const data = await jobsApi.get(id)
      setJob(data); setError('')
      // Load per-frame timing alongside job data
      await loadTimings(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load job')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id, loadTimings])

  useEffect(() => {
    let cancelled = false
    const run = async () => { if (!cancelled) await load() }
    run()
    const timer = setInterval(() => { if (!cancelled) load(true) }, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [load])

  const handleAction = async (nextStatus: string) => {
    if (!job || acting) return
    setActing(true)
    try {
      const token = getToken() ?? ''
      await fetch(`/api/jobs?id=${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      await load(true)
    } catch { /* next poll will sync */ }
    finally { setActing(false) }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const authUser = getUser()
  const cfg      = STATUS_CFG[job?.status ?? ''] ?? { globe: 'pending', label: job?.status ?? '' }
  const actions  = ACTIONS[job?.status ?? ''] ?? []

  const { frames, start, end, total, done, pct } = useMemo(() => {
    const str   = job?.frames ?? '1-1'
    const parts = str.replace(/\s/g, '').split('-')
    const start = parseInt(parts[0]) || 1
    const end   = parts.length > 1 ? parseInt(parts[1]) || start : start
    const total = Math.max(1, end - start + 1)
    const done  = job?.outputs?.length ?? 0
    const pct   = DONE_STATUSES.has(job?.status ?? '')  ? 100
                : job?.status === 'running'              ? Math.round((done / total) * 100)
                : 0
    return { frames: str, start, end, total, done, pct }
  }, [job])

  const totalTaskPages = Math.max(1, Math.ceil(total / TASK_PAGE_SIZE))
  const taskStart      = (taskPage - 1) * TASK_PAGE_SIZE
  const taskEnd        = Math.min(taskStart + TASK_PAGE_SIZE, total)
  const taskIndices    = Array.from({ length: taskEnd - taskStart }, (_, i) => taskStart + i)

  // Manifest + DB fields
  const manifest      = job?.manifest
  const workerHost    = job?.workerHost        ?? ''
  const outputPath    = job?.outputPath        ?? ''
  const statusDesc    = job?.statusDescription ?? ''
  const isPreemptible = !!(manifest?.preemptible ?? true)
  const projectName   = manifest?.project ?? 'Default'
  const taskCores     = manifest?.cores ?? 4
  const taskMemoryGB  = manifest?.memory_gb ?? 16

  // Instance chip label when no worker assigned yet — show from manifest
  const instanceLabel = (() => {
    if (manifest?.gpu_type) {
      const n = manifest.gpus ?? 1
      return `${n}× ${manifest.gpu_type.replace(/_/g, ' ')}`
    }
    if (manifest?.instance_type) return manifest.instance_type
    return `${frames} frames`
  })()

  // software label: "Blender 3.1.0 Linux" style
  const softwareRaw  = job?.software ?? ''   // e.g. "blender-4-1"
  const softwarePretty = softwareRaw
    .replace(/^blender-/i, 'Blender ')
    .replace(/-/g, '.')
    + (softwareRaw ? ' Linux' : '')

  // ── Loading / error skeleton ────────────────────────────────────────────────
  const breadcrumb = (
    <nav className="job-detail-breadcrumb" aria-label="Breadcrumb">
      <Link href="/">Jobs</Link>
      <span>/</span>
      <span>Job: {id}</span>
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

  // Title value: "Blender 3.1.0 Linux Render {jobTitle}" — matches Conductor format
  const titleValue = [softwarePretty, 'Render', job.title].filter(Boolean).join(' ')

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="job-detail-card">

        {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
        {breadcrumb}

        {/* ── Two-column body ─────────────────────────────────────────────── */}
        <div className="job-detail-cols">

          {/* LEFT — 3 stacked metadata fields (label above value) */}
          <div className="job-detail-left">

            {/* Job Title */}
            <div className="job-detail-field">
              <span className="job-detail-field-label">Job Title:</span>
              <span className="job-detail-field-value">{titleValue || '—'}</span>
            </div>

            {/* Output Path */}
            <div className="job-detail-field">
              <span className="job-detail-field-label">Output Path:</span>
              <span className="job-detail-field-value">{outputPath || '—'}</span>
            </div>

            {/* Status Description */}
            <div className="job-detail-field">
              <span className="job-detail-field-label">Status Description:</span>
              <span className="job-detail-field-value">{statusDesc || ''}</span>
            </div>

            {/* Holding banner */}
            {job.status === 'holding' && (
              <div className="holding-banner mt-4">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>
                  <strong>Job is on hold</strong>
                  {statusDesc
                    ? ` — ${statusDesc}`
                    : ' — Click Unhold when a suitable worker is available.'}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT — globe · status · user/project · machine chip · actions */}
          <div className="job-detail-right">

            {/* Status globe */}
            <div className={`job-status-globe job-status-globe-${cfg.globe}`} aria-hidden="true" />

            {/* Status label */}
            <div className={`job-detail-status-label job-status-label-${job.status}`}>
              {cfg.label}
            </div>

            {/* User | Project — Conductor places these below the globe */}
            <div className="job-detail-right-owner">
              <span>{authUser?.email?.split('@')[0] ?? 'Administrator'}</span>
              <span className="job-detail-right-owner-project">
                {/* project folder icon */}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                {projectName}
              </span>
            </div>

            {/* Machine chip + spot badge */}
            <div className="job-machine-row">
              {workerHost ? (
                <span className="job-instance-chip">
                  {/* CW / server icon */}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <rect x="2" y="2" width="20" height="8" rx="2"/>
                    <rect x="2" y="14" width="20" height="8" rx="2"/>
                    <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3"/>
                    <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3"/>
                  </svg>
                  {workerHost}
                </span>
              ) : (
                <span className="job-instance-chip">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  {instanceLabel}
                </span>
              )}
              {isPreemptible && <span className="job-spot-badge">spot</span>}
            </div>

            {/* Action buttons */}
            {actions.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-center mt-3">
                {actions.map(a => (
                  <button key={a.next} type="button"
                    className={`btn-action ${a.style}`}
                    disabled={acting}
                    onClick={() => handleAction(a.next)}>
                    {acting ? '…' : a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <hr className="job-detail-divider" />

        {/* ── Render progress bar ───────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Render progress</span>
            <div className="flex items-center gap-3">
              <span>{done} / {total} frames ({pct}%)</span>
              {/* Scout Frames button — only on jobs that aren't done yet */}
              {!['success','downloaded','done','failed'].includes(job.status) && total > 1 && (
                <button type="button"
                  className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  onClick={() => { setScoutCreated(''); setShowScout(true) }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  Scout Frames
                </button>
              )}
              {(job.outputs?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  onClick={() => {
                    const urls = job.outputs ?? []
                    urls.forEach((url, i) => {
                      setTimeout(() => {
                        const a = document.createElement('a')
                        a.href     = url
                        a.download = `frame_${String(i).padStart(4, '0')}.png`
                        a.target   = '_blank'
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                      }, i * 300)
                    })
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download All ({job.outputs?.length})
                </button>
              )}
            </div>
          </div>
          <progress
            className={`job-progress-bar job-progress-bar--${job.status}`}
            value={pct}
            max={100}
          />
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
                const frameNum   = start + idx
                const timing     = taskTimings[idx]
                const tStatus    = (timing?.status ?? frameStatus(job.status, idx, job.outputs ?? [])) as TaskStatus
                const outputUrl  = timing?.outputUrl || job.outputs?.[idx]
                const isSelected = selTask === idx

                return (
                  <tr key={idx}
                    className={`job-task-row${isSelected ? ' job-task-row--selected' : ''}`}
                    onClick={() => setSelTask(isSelected ? null : idx)}>

                    <td className="job-task-td">
                      <Link
                        href={`/jobs/${id}/${padTask(idx)}/log`}
                        className="text-blue-400 hover:underline"
                        onClick={e => e.stopPropagation()}>
                        {padTask(idx)}
                      </Link>
                    </td>
                    <td className="job-task-td">{frameNum}</td>
                    <td className="job-task-td"><TaskStatusCell status={tStatus} /></td>
                    <td className="job-task-td right">{taskCores}</td>
                    <td className="job-task-td right">{taskMemoryGB} GB</td>
                    <td className="job-task-td center">
                      {isPreemptible
                        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded text-xs border bg-blue-500/20 border-blue-500/40 text-blue-400">✓</span>
                        : <span className="inline-flex items-center justify-center w-5 h-5 rounded text-xs border bg-white/5 border-white/10 text-gray-600">—</span>
                      }
                    </td>
                    <td className="job-task-td right text-gray-400">{fmtDuration(timing?.durationSec ?? null)}</td>
                    <td className="job-task-td right text-gray-400">{fmtTime(timing?.startedAt ?? null)}</td>
                    <td className="job-task-td right text-gray-400">{fmtTime(timing?.completedAt ?? null)}</td>
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
          <nav className="flex items-center gap-2" aria-label="Task pagination">
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

      {/* ── Scout created toast ──────────────────────────────────────────── */}
      {scoutCreated && (
        <div className="fixed bottom-6 right-6 z-50 bg-amber-500/20 border border-amber-500/40 rounded-lg px-4 py-3 text-sm text-amber-300 shadow-xl flex items-center gap-3">
          <span>Scout job <strong>{scoutCreated}</strong> created and queued.</span>
          <button type="button" onClick={() => setScoutCreated('')}
            className="text-amber-400 hover:text-amber-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Scout Frames modal ───────────────────────────────────────────── */}
      {showScout && job && (
        <ScoutModal
          jobNumber={job.jobNumber}
          frameStart={start}
          frameEnd={end}
          onClose={() => setShowScout(false)}
          onCreated={num => setScoutCreated(num)}
        />
      )}
    </div>
  )
}
