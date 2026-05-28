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

// ── Per-chunk task timing (from tasks table) ──────────────────────────────────
interface TaskTiming {
  status:      string
  startedAt:   string | null
  completedAt: string | null
  outputUrl:   string
  durationSec: number | null
  isScout:     boolean
  startFrame:  number | null
  endFrame:    number | null
  costUsd:     number | null
}

// Conductor format: "0.35 Minutes" / "1.20 Minutes" / "1.50 Hours"
function fmtDuration(sec: number | null): string {
  if (sec == null || sec < 0) return '—'
  if (sec >= 3600) return `${(sec / 3600).toFixed(2)} Hours`
  return `${(sec / 60).toFixed(2)} Minutes`
}

// Conductor format: full date + time  e.g. "5/27/2026, 2:44:47 AM"
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  })
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
  reviewed:       { globe: 'downloaded',     label: 'reviewed'       },
}

// ── Action buttons per job status ─────────────────────────────────────────────
// 'action' drives handleAction():
//   'hold'     → PATCH status = 'holding'
//   'kill'     → POST /api/jobs/[jobNumber]/kill
//   'unhold'   → POST /api/jobs/[jobNumber]/unhold  (re-dispatches incomplete frames)
//   'dispatch' → POST /api/gcp/dispatch             (re-dispatches all frames)
//   'rsync'    → PATCH status = 'syncing'
type ActionDef = { label: string; action: string; style: string }

const HOLD   : ActionDef = { label: 'Hold',       action: 'hold',     style: 'btn-action--warn'    }
const UNHOLD : ActionDef = { label: 'Unhold',      action: 'unhold',   style: 'btn-action--primary' }
const KILL   : ActionDef = { label: 'Kill',        action: 'kill',     style: 'btn-action--danger'  }
const RETRY  : ActionDef = { label: 'Retry',       action: 'dispatch', style: 'btn-action--primary' }
const RSYNC  : ActionDef = { label: 'Retry Sync',  action: 'rsync',    style: 'btn-action--warn'    }

const ACTIONS: Record<string, ActionDef[]> = {
  queued:         [HOLD, KILL],
  done:           [],
  upload_pending: [KILL],
  uploading:      [KILL],
  sync_pending:   [KILL],
  sync_failed:    [RSYNC, KILL],
  syncing:        [KILL],
  pending:        [HOLD, KILL],
  holding:        [UNHOLD, KILL],
  running:        [KILL],
  success:        [],
  downloaded:     [],
  failed:         [RETRY],
  killed:         [RETRY],
  preempted:      [RETRY],
}

// ── Per-frame task status ─────────────────────────────────────────────────────
type TaskStatus = 'done' | 'complete' | 'success' | 'running' | 'failed' | 'holding' | 'pending' | 'reviewed' | 'preempted' | 'held'

const DONE_STATUSES     = new Set(['done', 'success', 'complete', 'downloaded', 'reviewed'])
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

// Map internal "done" → display "success" to match Conductor labels
const TASK_STATUS_LABEL: Partial<Record<TaskStatus, string>> = { done: 'success', complete: 'success', success: 'success' }

function TaskStatusCell({ status }: { status: TaskStatus }) {
  const label = TASK_STATUS_LABEL[status] ?? status
  return (
    <span className={`task-status task-status--${status}`}>
      <span className="task-status-dot" />
      {label}
    </span>
  )
}

function ScoutBadge() {
  return (
    <span className="scout-badge">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      SCOUT
    </span>
  )
}

// ── Task table column config ──────────────────────────────────────────────────
type TaskColKey = 'frames' | 'status' | 'cores' | 'memory' | 'preemptible' | 'elapsed' | 'start_time' | 'end_time' | 'cost'

const TASK_COLUMNS: { key: TaskColKey; label: string; align?: string }[] = [
  { key: 'frames',      label: 'FRAMES' },
  { key: 'status',      label: 'STATUS' },
  { key: 'cores',       label: 'CORES',       align: 'right' },
  { key: 'memory',      label: 'MEMORY',      align: 'right' },
  { key: 'preemptible', label: 'PREEMPTIBLE', align: 'center' },
  { key: 'elapsed',     label: 'ELAPSED',     align: 'right' },
  { key: 'start_time',  label: 'START TIME',  align: 'right' },
  { key: 'end_time',    label: 'END TIME',    align: 'right' },
  { key: 'cost',        label: 'COST',        align: 'right' },
]

const TASK_COL_BTN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
    <line x1="15" y1="3" x2="15" y2="21"/>
  </svg>
)

function TaskColumnsPopover({ visible, onToggle }: { visible: Set<TaskColKey>; onToggle: (k: TaskColKey) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      {open ? (
        <button type="button" aria-expanded="true" className="col-popover-btn" onClick={() => setOpen(false)}>
          {TASK_COL_BTN_ICON} Columns
        </button>
      ) : (
        <button type="button" aria-expanded="false" className="col-popover-btn" onClick={() => setOpen(true)}>
          {TASK_COL_BTN_ICON} Columns
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="col-popover-panel" aria-label="Toggle columns">
            {TASK_COLUMNS.map(col => (
              <label key={col.key}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 cursor-pointer">
                <input type="checkbox" className="accent-blue-500"
                  checked={visible.has(col.key)} onChange={() => onToggle(col.key)} />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
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
  const [acting,        setActing]        = useState(false)
  const [actionMsg,     setActionMsg]     = useState('')
  const [retryingTasks, setRetryingTasks] = useState<Set<number>>(new Set())
  const [taskErrors,    setTaskErrors]    = useState<Record<number, string>>({})
  const [taskPage,      setTaskPage]      = useState(1)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; idx: number; frameNum: number; status: TaskStatus
  } | null>(null)
  const [selTask,         setSelTask]         = useState<number | null>(null)
  const [showScout,       setShowScout]       = useState(false)
  const [scoutCreated,    setScoutCreated]    = useState('')
  const [approvingScouts, setApprovingScouts] = useState(false)
  const [approveMsg,      setApproveMsg]      = useState('')
  const [taskVisibleCols, setTaskVisibleCols] = useState<Set<TaskColKey>>(
    new Set(TASK_COLUMNS.map(c => c.key)) // all columns visible by default
  )
  const toggleTaskCol = useCallback((k: TaskColKey) => {
    setTaskVisibleCols(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
  }, [])

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

  // Dismiss context menu on any click or Escape
  useEffect(() => {
    if (!ctxMenu) return
    const dismiss = () => setCtxMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null) }
    window.addEventListener('click', dismiss)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('keydown', onKey) }
  }, [ctxMenu])

  const handleAction = async (action: string) => {
    if (!job || acting) return
    setActing(true)
    setActionMsg('')
    try {
      const token = getToken() ?? ''

      if (action === 'dispatch') {
        // Retry: re-dispatch all frames on GCP
        const machineType = (job.manifest?.machine_type as string | undefined) ?? 'n1-standard-4'
        const preemptible = (job.manifest?.preemptible as boolean | undefined) ?? true
        const res = await fetch('/api/gcp/dispatch', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ jobId: job.id, machineType, preemptible }),
        })
        const json = await res.json() as { message?: string; vmCount?: number }
        if (!res.ok) setActionMsg(json.message ?? 'Dispatch failed')

      } else if (action === 'unhold') {
        // Unhold: dispatch remaining (incomplete) frames
        const res = await fetch(`/api/jobs/${job.jobNumber}/unhold`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json() as { message?: string }
        if (!res.ok) setActionMsg(json.message ?? 'Unhold failed')

      } else if (action === 'kill') {
        // Kill: terminate all VMs + mark killed
        await fetch(`/api/jobs/${job.jobNumber}/kill`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}` },
        })

      } else if (action === 'hold') {
        // Hold: pause — just update status
        await fetch(`/api/jobs?id=${job.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ status: 'holding' }),
        })

      } else if (action === 'rsync') {
        await fetch(`/api/jobs?id=${job.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ status: 'syncing' }),
        })
      }

      await load(true)
    } catch { /* next poll will sync */ }
    finally { setActing(false) }
  }

  const handleTaskRetry = async (frameIdx: number) => {
    if (!job || retryingTasks.has(frameIdx)) return
    setRetryingTasks(prev => new Set(prev).add(frameIdx))
    setTaskErrors(prev => { const n = { ...prev }; delete n[frameIdx]; return n })
    try {
      const token = getToken() ?? ''
      const taskId = String(frameIdx).padStart(3, '0')
      const res = await fetch(`/api/jobs/${job.jobNumber}/tasks/${taskId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { message?: string }
      if (!res.ok) {
        setTaskErrors(prev => ({ ...prev, [frameIdx]: json.message ?? 'Retry failed' }))
      } else {
        await load(true)
      }
    } catch (e) {
      setTaskErrors(prev => ({ ...prev, [frameIdx]: e instanceof Error ? e.message : 'Network error' }))
    } finally {
      setRetryingTasks(prev => { const n = new Set(prev); n.delete(frameIdx); return n })
    }
  }

  const handleTaskAction = async (action: string, idx: number) => {
    if (!job) return
    setCtxMenu(null)
    const token  = getToken() ?? ''
    const taskId = String(idx).padStart(3, '0')
    const base   = `/api/jobs/${job.jobNumber}/tasks/${taskId}`

    setTaskErrors(prev => { const n = { ...prev }; delete n[idx]; return n })
    setRetryingTasks(prev => new Set(prev).add(idx))

    try {
      let res: Response
      if (action === 'retry' || action === 'retry-failed' || action === 'retry-preempted' || action === 'retry-sync' || action === 'unhold') {
        res = await fetch(`${base}/retry`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      } else if (action === 'hold') {
        res = await fetch(`${base}/hold`,  { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      } else if (action === 'kill') {
        res = await fetch(`${base}/kill`,  { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      } else if (action === 'reviewed') {
        res = await fetch(`/api/jobs/${job.jobNumber}/tasks/${taskId}`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ status: 'reviewed' }),
        })
      } else {
        return
      }
      const json = await res.json() as { message?: string }
      if (!res.ok) setTaskErrors(prev => ({ ...prev, [idx]: json.message ?? `${action} failed` }))
      else await load(true)
    } catch (e) {
      setTaskErrors(prev => ({ ...prev, [idx]: e instanceof Error ? e.message : 'Network error' }))
    } finally {
      setRetryingTasks(prev => { const n = new Set(prev); n.delete(idx); return n })
    }
  }

  const handleApproveScouts = async () => {
    if (!job || approvingScouts) return
    setApprovingScouts(true)
    setApproveMsg('')
    try {
      const token = getToken() ?? ''
      const res = await fetch(`/api/jobs/${job.jobNumber}/approve-scouts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json() as { ok?: boolean; released?: number; message?: string }
      if (!res.ok) {
        setApproveMsg(json.message ?? 'Approve failed')
      } else {
        setApproveMsg(`Released ${json.released ?? 0} held tasks`)
        await load(true)
      }
    } catch {
      setApproveMsg('Network error')
    } finally {
      setApprovingScouts(false)
    }
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
    const pct   = DONE_STATUSES.has(job?.status ?? '') ? 100
                : done > 0                              ? Math.round((done / total) * 100)
                : 0
    return { frames: str, start, end, total, done, pct }
  }, [job])

  // ── Scout / held banner logic ───────────────────────────────────────────────
  const taskTimingList = Object.values(taskTimings)
  const hasScoutTasks  = taskTimingList.some(t => t.isScout)
  const scoutsAllDone  = hasScoutTasks && taskTimingList.filter(t => t.isScout).every(t => DONE_STATUSES.has(t.status))
  const heldTaskCount  = taskTimingList.filter(t => t.status === 'held').length
  const showApproveBtn = hasScoutTasks && scoutsAllDone && heldTaskCount > 0

  // When taskTimings has rows, use chunk count for pagination; else fall back to frame count
  const taskKeys       = Object.keys(taskTimings).map(Number).sort((a, b) => a - b)
  const taskRowCount   = taskKeys.length > 0 ? taskKeys.length : total
  const totalTaskPages = Math.max(1, Math.ceil(taskRowCount / TASK_PAGE_SIZE))
  const taskStart      = (taskPage - 1) * TASK_PAGE_SIZE
  const taskEnd        = Math.min(taskStart + TASK_PAGE_SIZE, taskRowCount)
  // When we have real task rows, iterate over their keys; otherwise use 0-based frame indices
  const taskIndices    = taskKeys.length > 0
    ? taskKeys.slice(taskStart, taskEnd)
    : Array.from({ length: taskEnd - taskStart }, (_, i) => taskStart + i)

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
  const username = authUser?.email?.split('@')[0] ?? 'Administrator'
  const breadcrumb = (
    <nav className="job-detail-breadcrumb" aria-label="Breadcrumb">
      {/* Left: path */}
      <span className="job-detail-breadcrumb-path">
        <Link href="/">Jobs</Link>
        <span>/</span>
        <span>Job: {id}</span>
      </span>
      {/* Right: user | project — inline, like Conductor */}
      <span className="job-detail-breadcrumb-owner">
        <span className="job-detail-breadcrumb-user">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          {username}
        </span>
        <span className="job-detail-breadcrumb-sep">|</span>
        <span className="job-detail-breadcrumb-project">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {job?.manifest?.project as string ?? 'Default'}
        </span>
      </span>
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
  // Addon already prefixes "Blender X.Y Linux Render …" — don't double it
  const titleValue = /^blender\s/i.test(job.title ?? '')
    ? (job.title ?? '')
    : [softwarePretty, 'Render', job.title].filter(Boolean).join(' ')

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="job-detail-card">

        {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
        {breadcrumb}

        {/* ── Two-column body ─────────────────────────────────────────────── */}
        <div className="job-detail-cols">

          {/* LEFT — metadata fields (only non-empty fields shown) */}
          <div className="job-detail-left">

            {/* Job Title — always shown */}
            <div className="job-detail-field">
              <span className="job-detail-field-label">Job Title</span>
              <span className="job-detail-field-value">{titleValue || '—'}</span>
            </div>

            {/* Output Path — only shown when non-empty */}
            {outputPath && (
              <div className="job-detail-field">
                <span className="job-detail-field-label">Output Path</span>
                <span className="job-detail-field-value">{outputPath}</span>
              </div>
            )}

            {/* Status Description — only shown when non-empty */}
            {statusDesc && (
              <div className="job-detail-field">
                <span className="job-detail-field-label">Status Description</span>
                <span className="job-detail-field-value">{statusDesc}</span>
              </div>
            )}

            {/* Holding banner */}
            {job.status === 'holding' && (
              <div className="holding-banner mt-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
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

          {/* RIGHT — globe · status (CAPS) · machine chip · spot · actions */}
          <div className="job-detail-right">

            {/* Status globe */}
            <div className={`job-status-globe job-status-globe-${cfg.globe}`} aria-hidden="true" />

            {/* Status label — uppercase, like Conductor "SUCCESS" */}
            <div className={`job-detail-status-label job-status-label-${job.status}`}>
              {cfg.label.toUpperCase()}
            </div>

            {/* Machine chip + spot badge */}
            <div className="job-machine-row">
              {workerHost ? (
                <span className="job-instance-chip">
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
              <div className="flex flex-col items-center gap-1.5 mt-2">
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {actions.map(a => (
                    <button key={a.action} type="button"
                      className={`btn-action ${a.style}`}
                      disabled={acting}
                      onClick={() => handleAction(a.action)}>
                      {acting ? '…' : a.label}
                    </button>
                  ))}
                </div>
                {actionMsg && (
                  <span className="text-xs text-red-400 text-center leading-tight">{actionMsg}</span>
                )}
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
            Tasks <span className="text-gray-500 font-normal">({taskRowCount})</span>
            {heldTaskCount > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                · {heldTaskCount} held
              </span>
            )}
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Showing {taskStart + 1}–{taskEnd} of {taskRowCount}
            </span>
            <TaskColumnsPopover visible={taskVisibleCols} onToggle={toggleTaskCol} />
          </div>
        </div>

        {/* Approve Scout Frames banner */}
        {showApproveBtn && (
          <div className="approve-scouts-banner">
            <span className="approve-scouts-banner-text">
              <strong>Scout frames complete.</strong> All scout tasks finished — approve to release {heldTaskCount} held task{heldTaskCount !== 1 ? 's' : ''} and spawn their VMs.
              {approveMsg && <span className="ml-2 text-xs opacity-75">{approveMsg}</span>}
            </span>
            <button
              type="button"
              className="approve-scouts-btn"
              disabled={approvingScouts}
              onClick={handleApproveScouts}>
              {approvingScouts ? 'Releasing…' : 'Approve Scout Frames'}
            </button>
          </div>
        )}

        <div className="job-task-wrap mb-3">
          <table className="job-task-table">
            <thead>
              <tr>
                <th className="job-task-th">TASK ID</th>
                {TASK_COLUMNS.filter(c => taskVisibleCols.has(c.key)).map(c => (
                  <th key={c.key} className={`job-task-th${c.align ? ' ' + c.align : ''}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskIndices.map((idx) => {
                const timing     = taskTimings[idx]
                // Frame range display: use DB start/end if available, else derive from index
                const sf         = timing?.startFrame ?? (start + idx)
                const ef         = timing?.endFrame   ?? sf
                const frameLabel = sf === ef ? String(sf) : `${sf}–${ef}`
                const tStatus    = (timing?.status ?? frameStatus(job.status, idx, job.outputs ?? [])) as TaskStatus
                const isSelected = selTask === idx

                return (
                  <tr key={idx}
                    className={`job-task-row${isSelected ? ' job-task-row--selected' : ''}`}
                    onClick={() => setSelTask(isSelected ? null : idx)}
                    onContextMenu={e => {
                      e.preventDefault()
                      setCtxMenu({ x: e.clientX, y: e.clientY, idx, frameNum: sf, status: tStatus })
                    }}>

                    <td className="job-task-td">
                      <Link
                        href={`/jobs/${id}/${padTask(idx)}/log`}
                        className="text-blue-400 hover:underline"
                        onClick={e => e.stopPropagation()}>
                        {padTask(idx)}
                      </Link>
                    </td>
                    {taskVisibleCols.has('frames')      && <td className="job-task-td">{frameLabel}</td>}
                    {taskVisibleCols.has('status')      && <td className="job-task-td"><TaskStatusCell status={tStatus} /></td>}
                    {taskVisibleCols.has('cores')       && <td className="job-task-td right">{taskCores}</td>}
                    {taskVisibleCols.has('memory')      && <td className="job-task-td right">{taskMemoryGB} GB</td>}
                    {taskVisibleCols.has('preemptible') && (
                      <td className="job-task-td center text-gray-400">{isPreemptible ? '✓' : '—'}</td>
                    )}
                    {taskVisibleCols.has('elapsed')    && <td className="job-task-td right text-gray-400">{fmtDuration(timing?.durationSec ?? null)}</td>}
                    {taskVisibleCols.has('start_time') && <td className="job-task-td right text-gray-400">{fmtTime(timing?.startedAt ?? null)}</td>}
                    {taskVisibleCols.has('end_time')   && <td className="job-task-td right text-gray-400">{fmtTime(timing?.completedAt ?? null)}</td>}
                    {taskVisibleCols.has('cost')       && (
                      <td className="job-task-td right text-gray-400">
                        {timing?.costUsd != null ? `$${timing.costUsd.toFixed(2)}` : '—'}
                      </td>
                    )}
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
            <span className="text-gray-300">{taskRowCount}</span> entries
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

      {/* ── Task right-click context menu — full fixed list, greyed when N/A ── */}
      {ctxMenu && (() => {
        const s = ctxMenu.status
        const active = (actions: string[]) => actions.includes(s)

        // Enabled rules per action — matches Conductor behaviour
        const enabled: Record<string, boolean> = {
          hold:            active(['pending','queued']),
          kill:            active(['pending','running','holding','queued','held']),
          retry:           !active(['done','complete','success']),
          'retry-failed':  s === 'failed',
          'retry-preempted': s === 'preempted',
          'retry-sync':    active(['sync_failed','syncing']),
          reviewed:        active(['done','complete','success','failed','killed']),
          unhold:          s === 'holding',
        }

        type CtxEntry =
          | { type: 'sep' }
          | { type: 'item'; label: string; action: string; danger?: boolean }

        const MENU: CtxEntry[] = [
          { type: 'item', label: 'Hold',            action: 'hold'            },
          { type: 'item', label: 'Kill',            action: 'kill', danger: true },
          { type: 'sep'  },
          { type: 'item', label: 'Retry',           action: 'retry'           },
          { type: 'item', label: 'Retry Failed',    action: 'retry-failed'    },
          { type: 'item', label: 'Retry Preempted', action: 'retry-preempted' },
          { type: 'item', label: 'Retry Sync',      action: 'retry-sync'      },
          { type: 'sep'  },
          { type: 'item', label: 'Reviewed',        action: 'reviewed'        },
          { type: 'item', label: 'Unhold',          action: 'unhold'          },
        ]

        return (
          <div
            className="task-ctx-menu"
            style={{ '--ctx-top': `${ctxMenu.y}px`, '--ctx-left': `${ctxMenu.x}px` } as React.CSSProperties}
            onClick={e => e.stopPropagation()}>
            {MENU.map((entry, i) =>
              entry.type === 'sep'
                ? <div key={i} className="task-ctx-sep" />
                : <button
                    key={entry.action}
                    type="button"
                    disabled={!enabled[entry.action]}
                    className={`task-ctx-item${entry.danger ? ' task-ctx-item--danger' : ''}`}
                    onClick={() => enabled[entry.action] && handleTaskAction(entry.action, ctxMenu.idx)}>
                    {entry.label}
                  </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
