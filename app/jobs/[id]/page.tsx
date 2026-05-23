'use client'

import { use, useState, useMemo } from 'react'
import Link from 'next/link'
import { jobs as jobsApi } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'
import type { Job } from '@/types/job'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'UTC',
  }).format(new Date(iso))
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function calcElapsed(start: string | null, end: string | null): string {
  if (!start) return '—'
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

// ---------------------------------------------------------------------------
// Status globe
// ---------------------------------------------------------------------------
function StatusGlobe({ status }: { status: string }) {
  const cls = ['running','completed','downloaded'].includes(status)
    ? `job-status-globe-running`
    : status === 'failed' ? 'job-status-globe-failed'
    : 'job-status-globe-pending'
  return (
    <div className={`job-status-globe ${cls}`} aria-label={status}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <ellipse cx="12" cy="12" rx="4" ry="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="4.5" y1="6" x2="19.5" y2="6" />
        <line x1="4.5" y1="18" x2="19.5" y2="18" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tasks table
// ---------------------------------------------------------------------------
const TASK_COLS = ['TASK ID','STATUS','START TIME','END TIME','ELAPSED'] as const
type TaskCol = (typeof TASK_COLS)[number]

interface ApiTaskRow {
  id: string
  taskNumber: string
  status: string
  startedAt: string | null
  completedAt: string | null
  outputPath: string | null
}

function TasksTable({ tasks, jobId }: { tasks: ApiTaskRow[]; jobId: string }) {
  const [search,      setSearch]      = useState('')
  const [visibleCols, setVisibleCols] = useState<Set<TaskCol>>(new Set(TASK_COLS))
  const [colsOpen,    setColsOpen]    = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? tasks.filter((t) => t.taskNumber.includes(q) || t.status.includes(q)) : tasks
  }, [tasks, search])

  const toggleCol = (col: TaskCol) => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(col) && next.size > 1) next.delete(col)
      else next.add(col)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label htmlFor="task-search" className="text-xs text-gray-500">Search:</label>
          <input id="task-search" type="search" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="table-input px-2 py-1 text-sm w-40" />
        </div>
        <div className="relative">
          {colsOpen ? (
            <button type="button" aria-expanded="true" className="col-popover-btn" onClick={() => setColsOpen(false)}>Columns</button>
          ) : (
            <button type="button" aria-expanded="false" className="col-popover-btn" onClick={() => setColsOpen(true)}>Columns</button>
          )}
          {colsOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setColsOpen(false)} />
              <div className="col-popover-panel">
                {TASK_COLS.map((col) => (
                  <label key={col} className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 cursor-pointer">
                    <input type="checkbox" className="accent-blue-500"
                      checked={visibleCols.has(col)} onChange={() => toggleCol(col)} />
                    {col}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="jobs-table-wrap">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {TASK_COLS.filter((c) => visibleCols.has(c)).map((col) => (
                <th key={col} className="jobs-th">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.size} className="px-4 py-10 text-center text-gray-600 text-sm">
                  No tasks found.
                </td>
              </tr>
            ) : filtered.map((task) => (
              <tr key={task.id} className="jobs-tbody-row">
                {visibleCols.has('TASK ID')   && <td className="jobs-td font-mono"><Link href={`/jobs/${jobId}/${task.taskNumber}/log`} className="text-blue-400 hover:underline">{task.taskNumber}</Link></td>}
                {visibleCols.has('STATUS')    && <td className="jobs-td"><div className="flex items-center gap-2"><StatusGlobe status={task.status} /><span className="text-gray-300 text-xs">{task.status}</span></div></td>}
                {visibleCols.has('START TIME') && <td className="jobs-td text-gray-400 font-mono text-xs">{fmtTime(task.startedAt)}</td>}
                {visibleCols.has('END TIME')   && <td className="jobs-td text-gray-400 font-mono text-xs">{fmtTime(task.completedAt)}</td>}
                {visibleCols.has('ELAPSED')    && <td className="jobs-td text-gray-400 font-mono text-xs">{calcElapsed(task.startedAt, task.completedAt)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500">
        Showing <span className="text-gray-300 font-medium">1 to {filtered.length}</span> of <span className="text-gray-300 font-medium">{filtered.length}</span> entries
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
interface PageProps { params: Promise<{ id: string }> }

export default function JobDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: job, loading, error } = useApiFetch(() => jobsApi.get(id), [id])

  if (loading) return (
    <div className="flex flex-col gap-6">
      <nav className="job-detail-breadcrumb"><Link href="/">Jobs</Link><span>/</span><span>Job: {id}</span></nav>
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  if (error || !job) return (
    <div className="flex flex-col gap-6">
      <nav className="job-detail-breadcrumb"><Link href="/">Jobs</Link><span>/</span><span>Job: {id}</span></nav>
      <p className="text-gray-500 text-sm">{error ?? `Job ${id} not found.`}</p>
    </div>
  )

  const displayStatus = job.status === 'completed' ? 'downloaded' : job.status as Job['status']

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Job</h1>

      <div className="job-detail-card">
        {/* Top row */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <nav className="job-detail-breadcrumb">
            <Link href="/">Jobs</Link>
            <span>/</span>
            <span className="text-gray-300">Job: {job.jobNumber}</span>
          </nav>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="job-instance-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
              {job.software}
            </div>
            <div className="flex items-center gap-2">
              <StatusGlobe status={displayStatus} />
              <span className="text-sm font-medium text-gray-200">{displayStatus}</span>
            </div>
          </div>
        </div>

        {/* User + project */}
        <div className="flex items-center gap-6 mb-5 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span className="text-gray-200 font-medium">{cap(job.user.name)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-gray-200 font-medium">{job.project.name}</span>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-2.5 mb-4">
          <div className="flex gap-4 flex-wrap">
            <span className="job-detail-meta-label">Job Title:</span>
            <span className="job-detail-meta-value">{job.title}</span>
          </div>
          <div className="flex gap-4 flex-wrap">
            <span className="job-detail-meta-label">Output Path:</span>
            <span className="job-detail-meta-value font-mono text-xs">
              {job.tasks.find((t) => (t as ApiTaskRow).outputPath)
                ? (job.tasks.find((t) => (t as ApiTaskRow).outputPath) as ApiTaskRow).outputPath
                : '—'}
            </span>
          </div>
          <div className="flex gap-4 flex-wrap">
            <span className="job-detail-meta-label">Status Description:</span>
            <span className="job-detail-meta-value text-gray-500">
              {job.completedAt ? `Completed ${fmtTime(job.completedAt)}` : job.startedAt ? 'Running' : 'Queued'}
            </span>
          </div>
        </div>

        <hr className="job-detail-divider" />
        <TasksTable tasks={job.tasks as ApiTaskRow[]} jobId={id} />
      </div>
    </div>
  )
}
