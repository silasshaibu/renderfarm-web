'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { tasks as tasksApi, type ApiJob, type ApiTask } from '@/lib/api'
import { getUser } from '@/lib/auth'

// ── Status globe — all 12 Conductor statuses ──────────────────────────────────
const GLOBE_CLASS: Record<string, string> = {
  upload_pending: 'job-status-globe-upload_pending',
  uploading:      'job-status-globe-uploading',
  sync_pending:   'job-status-globe-sync_pending',
  sync_failed:    'job-status-globe-sync_failed',
  syncing:        'job-status-globe-syncing',
  pending:        'job-status-globe-pending',
  holding:        'job-status-globe-holding',
  running:        'job-status-globe-running',
  success:        'job-status-globe-success',
  downloaded:     'job-status-globe-downloaded',
  done:           'job-status-globe-downloaded',  // legacy alias
  failed:         'job-status-globe-failed',
  preempted:      'job-status-globe-preempted',
  queued:         'job-status-globe-pending',     // legacy alias
}

function StatusGlobe({ status }: { status: string }) {
  const cls = GLOBE_CLASS[status] ?? 'job-status-globe-pending'
  return <div className={`job-status-globe ${cls}`} aria-label={status} />
}

// ── Log-line colouring ────────────────────────────────────────────────────────
function levelClass(level: string) {
  if (level === 'error') return 'text-red-400'
  if (level === 'warn')  return 'text-yellow-400'
  return 'text-gray-300'
}

// ── Executions panel ──────────────────────────────────────────────────────────
type ExecTab = 'Logs' | 'Environment'

interface LogLine { id: string; line: string; level: string; timestamp: string }

function ExecutionsPanel({
  executions,
  logs,
  livePolling,
}: {
  executions: ApiTask['executions']
  logs:       LogLine[]
  livePolling: boolean
}) {
  const [current, setCurrent] = useState(0)
  const [tab,     setTab]     = useState<ExecTab>('Logs')
  const logEndRef             = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new lines arrive while live
  useEffect(() => {
    if (livePolling) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length, livePolling])

  const exec  = executions[current] ?? { attempt: 1, status: 'unknown', id: '' }
  const total = executions.length || 1

  return (
    <div className="task-executions-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-300">Executions</h2>
        {livePolling && (
          <span className="flex items-center gap-1.5 text-xs text-teal-400">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Live
          </span>
        )}
      </div>

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
            disabled={current === 0}
            onClick={() => setCurrent(c => c - 1)} aria-label="Previous execution">‹</button>
          <button type="button" className="task-exec-nav-btn"
            disabled={current >= total - 1}
            onClick={() => setCurrent(c => c + 1)} aria-label="Next execution">›</button>
        </div>
      </div>

      {tab === 'Logs' ? (
        <div className="task-log-area">
          {logs.length === 0 ? (
            <span className="text-gray-600">
              {livePolling ? 'Waiting for log output…' : 'No logs found.'}
            </span>
          ) : (
            logs.map(l => (
              <div key={l.id} className={`font-mono text-xs leading-relaxed ${levelClass(l.level)}`}>
                {l.line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      ) : (
        <div className="jobs-table-wrap">
          <table className="task-env-table">
            <thead>
              <tr><th>Variable</th><th>Value</th></tr>
            </thead>
            <tbody>
              <tr><td className="text-blue-400">ATTEMPT</td><td>{exec.attempt}</td></tr>
              <tr><td className="text-blue-400">STATUS</td><td>{exec.status}</td></tr>
              {exec.duration != null && (
                <tr><td className="text-blue-400">DURATION_SEC</td><td>{exec.duration}</td></tr>
              )}
              {exec.startedAt && (
                <tr><td className="text-blue-400">STARTED_AT</td><td>{exec.startedAt}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface PageProps { params: Promise<{ id: string; taskId: string }> }

const LIVE_STATUSES = new Set(['running', 'syncing', 'uploading'])

export default function TaskLogPage({ params }: PageProps) {
  const { id, taskId } = use(params)

  const [job,        setJob]        = useState<ApiJob | null>(null)
  const [task,       setTask]       = useState<ApiTask | null>(null)
  const [logs,       setLogs]       = useState<LogLine[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const lastLogIdRef                = useRef<string | null>(null)

  // ── Load task + job ─────────────────────────────────────────────────────────
  const loadTask = useCallback(async (silent = false) => {
    try {
      const data = await tasksApi.get(id, taskId)
      setJob(data.job); setTask(data.task); setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load task')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id, taskId])

  // ── Load logs (incremental) ─────────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    try {
      const after = lastLogIdRef.current ?? undefined
      const newLines = await tasksApi.logs(id, taskId, after ?? undefined)
      if (newLines.length) {
        lastLogIdRef.current = newLines[newLines.length - 1].id
        setLogs(prev => [...prev, ...newLines])
      }
    } catch { /* ignore polling errors */ }
  }, [id, taskId])

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      await loadTask()
      if (!cancelled) await loadLogs()
    }
    init()
    return () => { cancelled = true }
  }, [loadTask, loadLogs])

  // ── Live polling — task status + new log lines every 4 s when running ───────
  const isLive = LIVE_STATUSES.has(job?.status ?? '')
  useEffect(() => {
    if (!isLive) return
    const timer = setInterval(async () => {
      await Promise.all([loadTask(true), loadLogs()])
    }, 4000)
    return () => clearInterval(timer)
  }, [isLive, loadTask, loadLogs])

  // ── Breadcrumb ───────────────────────────────────────────────────────────────
  const breadcrumb = (
    <nav className="job-detail-breadcrumb" aria-label="Breadcrumb">
      <Link href="/">Jobs</Link>
      <span>/</span>
      <Link href={`/jobs/${id}`}>Job: {id}</Link>
      <span>/</span>
      <span className="text-gray-300">Task: {taskId}</span>
    </nav>
  )

  if (loading) return (
    <div className="flex flex-col gap-6">
      {breadcrumb}
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  if (error || !job || !task) return (
    <div className="flex flex-col gap-6">
      {breadcrumb}
      <p className="text-red-400 text-sm">{error || `Task ${taskId} not found.`}</p>
    </div>
  )

  const authUser   = getUser()
  const manifest   = job.manifest
  const status     = task.status
  const outputUrl  = task.outputPath
  const files      = task.uploadedFiles ?? []
  const executions = task.executions    ?? []

  // Blender render command reconstructed from manifest
  const blenderCmd = manifest
    ? [
        'blender',
        '-b', manifest.scene ?? job.blenderFile,
        '-o', manifest.output_path ?? '/tmp/render/####',
        '-s', String(manifest.frame_start ?? '?'),
        '-e', String(manifest.frame_end   ?? '?'),
        '-a',
      ].join(' ')
    : '—'

  const projectName = manifest?.project ?? 'Default'
  const instanceLabel = manifest?.gpu_type
    ? `${manifest.gpus ?? 1}× ${manifest.gpu_type.replace(/_/g, ' ')}`
    : manifest?.instance_type ?? job.software

  const statusDesc = task.completedAt
    ? `Finished at ${new Date(task.completedAt).toLocaleString()}`
    : status === 'running' ? 'In progress'
    : status === 'pending' ? 'Waiting for worker'
    : status === 'holding' ? (job.statusDescription || 'On hold')
    : '—'

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Task</h1>

      <div className="job-detail-card">

        {/* ── Header: breadcrumb + status globe ──────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          {breadcrumb}
          <div className="flex items-center gap-2">
            <StatusGlobe status={status} />
            <span className={`text-sm font-medium job-status-label-${status}`}>{status}</span>
          </div>
        </div>

        {/* ── User / project / instance row ──────────────────────────────── */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span className="text-gray-200 font-medium">{authUser?.email?.split('@')[0] ?? 'artist'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span className="text-gray-200 font-medium">{projectName}</span>
          </div>
          <div className="job-instance-chip ml-auto">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="2" y="2" width="20" height="8" rx="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3"/>
              <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3"/>
            </svg>
            {instanceLabel}
          </div>
        </div>

        {/* ── Metadata ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 mb-4">
          <div>
            <span className="job-detail-meta-label block mb-1.5">Command:</span>
            <div className="task-command-box">{blenderCmd}</div>
          </div>

          {outputUrl && (
            <div className="flex gap-4 flex-wrap items-center">
              <span className="job-detail-meta-label">Output:</span>
              <a href={outputUrl} target="_blank" rel="noreferrer"
                className="text-blue-400 hover:underline font-mono text-xs truncate max-w-xs">
                {outputUrl}
              </a>
            </div>
          )}

          <div className="flex gap-4 flex-wrap items-center">
            <span className="job-detail-meta-label">Status:</span>
            <span className="job-detail-meta-value text-gray-400 text-sm">{statusDesc}</span>
          </div>
        </div>

        {/* ── Uploaded / asset files ─────────────────────────────────────── */}
        {files.length > 0 && (
          <>
            <hr className="job-detail-divider" />
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-300">Scene Assets</span>
                <span className="task-uploaded-badge">{files.length}</span>
              </div>
              <div className="task-uploaded-list" role="list">
                {files.map(f => (
                  <span key={f.id} className="task-uploaded-file" title={f.path} role="listitem">
                    {f.path}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Executions + live log ─────────────────────────────────────────── */}
      <ExecutionsPanel executions={executions} logs={logs} livePolling={isLive} />
    </div>
  )
}
