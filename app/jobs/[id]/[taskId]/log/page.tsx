'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { tasks as tasksApi } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function StatusGlobe({ status }: { status: string }) {
  const cls = ['running','completed','downloaded'].includes(status)
    ? 'job-status-globe-running'
    : status === 'failed' ? 'job-status-globe-failed'
    : 'job-status-globe-pending'
  return (
    <div className={`job-status-globe ${cls}`} aria-label={status}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <ellipse cx="12" cy="12" rx="4" ry="10" />
        <line x1="2"   y1="12" x2="22"  y2="12" />
        <line x1="4.5" y1="6"  x2="19.5" y2="6" />
        <line x1="4.5" y1="18" x2="19.5" y2="18" />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Executions panel
// ---------------------------------------------------------------------------
type ExecTab = 'Logs' | 'Environment'

function ExecutionsPanel({
  executions,
  logs,
}: {
  executions: { id: string; attempt: number; status: string; startedAt: string | null; duration: number | null }[]
  logs: { id: string; line: string; level: string; timestamp: string }[]
}) {
  const [current, setCurrent] = useState(0)
  const [tab,     setTab]     = useState<ExecTab>('Logs')

  const exec  = executions[current] ?? { attempt: 1, status: 'unknown', id: '' }
  const total = executions.length || 1

  const logText = logs.map((l) => l.line).join('\n')

  return (
    <div className="task-executions-card">
      <h2 className="text-sm font-semibold text-gray-300 mb-4">Executions</h2>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-mono
          bg-white/5 border border-white/10 text-gray-400">
          {exec.attempt}
        </span>

        <div className="flex items-center gap-1 bg-white/5 rounded p-0.5">
          {(['Logs', 'Environment'] as ExecTab[]).map((t) => (
            <button key={t} type="button"
              className={`task-exec-tab ${tab === t ? 'task-exec-tab--active' : 'task-exec-tab--idle'}`}
              onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <button type="button" className="task-exec-nav-btn"
            disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} aria-label="Previous execution">‹</button>
          <button type="button" className="task-exec-nav-btn"
            disabled={current >= total - 1} onClick={() => setCurrent((c) => c + 1)} aria-label="Next execution">›</button>
        </div>
      </div>

      {tab === 'Logs' ? (
        <div className="task-log-area">
          {logText.trim() ? logText : <span className="text-gray-600">No logs found.</span>}
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="task-env-table">
            <thead><tr><th>Variable</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td className="text-blue-400">STATUS</td><td>{exec.status}</td></tr>
              <tr><td className="text-blue-400">ATTEMPT</td><td>{exec.attempt}</td></tr>
              {exec.duration && <tr><td className="text-blue-400">DURATION_SEC</td><td>{exec.duration}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
interface PageProps { params: Promise<{ id: string; taskId: string }> }

export default function TaskLogPage({ params }: PageProps) {
  const { id, taskId } = use(params)

  const { data, loading, error } = useApiFetch(
    () => tasksApi.get(id, taskId),
    [id, taskId]
  )
  const { data: logData } = useApiFetch(
    () => tasksApi.logs(id, taskId),
    [id, taskId]
  )

  if (loading) return (
    <div className="flex flex-col gap-6">
      <nav className="job-detail-breadcrumb">
        <Link href="/">Jobs</Link><span>/</span>
        <Link href={`/jobs/${id}`}>Job: {id}</Link><span>/</span>
        <span>Task: {taskId}</span>
      </nav>
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  if (error || !data) return (
    <div className="flex flex-col gap-6">
      <nav className="job-detail-breadcrumb">
        <Link href="/">Jobs</Link><span>/</span>
        <Link href={`/jobs/${id}`}>Job: {id}</Link><span>/</span>
        <span>Task: {taskId}</span>
      </nav>
      <p className="text-gray-500 text-sm">{error ?? 'Task not found.'}</p>
    </div>
  )

  const { job, task } = data
  const logs       = logData ?? []
  const files      = task.uploadedFiles ?? []
  const executions = task.executions    ?? []
  const outputPath = task.outputPath    ?? '—'
  const status     = task.status === 'completed' ? 'downloaded' : task.status

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Task</h1>

      <div className="job-detail-card">
        {/* Breadcrumb + status */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <nav className="job-detail-breadcrumb">
            <Link href="/">Jobs</Link><span>/</span>
            <Link href={`/jobs/${id}`}>Job: {id}</Link><span>/</span>
            <span className="text-gray-300">Task: {taskId}</span>
          </nav>
          <div className="flex items-center gap-2">
            <StatusGlobe status={status} />
            <span className="text-sm font-medium text-gray-200">{status}</span>
          </div>
        </div>

        {/* User / project / instance */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            <span className="text-gray-200 font-medium">user</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-gray-200 font-medium">Default</span>
          </div>
          <div className="job-instance-chip ml-auto">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            {job.software}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <span className="job-detail-meta-label block mb-1.5">Command:</span>
            <div className="task-command-box">
              {logs.length > 0 ? logs[0].line : '—'}
            </div>
          </div>
          <div className="flex gap-4 flex-wrap">
            <span className="job-detail-meta-label">Output Path:</span>
            <span className="job-detail-meta-value font-mono text-xs">{outputPath}</span>
          </div>
          <div className="flex gap-4 flex-wrap">
            <span className="job-detail-meta-label">Status Description:</span>
            <span className="job-detail-meta-value text-gray-600">
              {task.completedAt ? 'Finished' : status === 'running' ? 'In progress' : '—'}
            </span>
          </div>
        </div>

        {/* Uploaded Files */}
        {files.length > 0 && (
          <>
            <hr className="job-detail-divider" />
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-300">Uploaded Files</span>
                <span className="task-uploaded-badge">{files.length}</span>
              </div>
              <div className="task-uploaded-list" role="list">
                {files.map((f) => (
                  <span key={f.id} className="task-uploaded-file" title={f.path} role="listitem">{f.path}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <ExecutionsPanel executions={executions} logs={logs} />
    </div>
  )
}
