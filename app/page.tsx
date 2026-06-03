'use client'

import { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import JobsTable from '@/components/JobsTable'
import ReRenderModal from '@/components/ReRenderModal'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'
import { isLoggedIn, getToken } from '@/lib/auth'
import type { Job, JobStatus } from '@/types/job'

function fmtAvgFrame(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  if (sec >= 60)   return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
  return `${Math.round(sec)}s`
}

// Map API job → UI Job shape
function mapJob(j: ApiJob): Job {
  const parts   = j.frames?.replace(/\s/g, '').split('-') ?? ['1']
  const start   = parseInt(parts[0]) || 1
  const end     = parts.length > 1 ? parseInt(parts[1]) || start : start
  const total   = end - start + 1
  const progress = j.status === 'done' ? 100 : j.status === 'running' ? 50 : 0

  const statusMap: Record<string, JobStatus> = {
    // Legacy DB names → canonical JobStatus
    done:   'downloaded',
    queued: 'pending',
    // All 12 Conductor statuses — explicit pass-through
    upload_pending: 'upload_pending',
    uploading:      'uploading',
    sync_pending:   'sync_pending',
    sync_failed:    'sync_failed',
    syncing:        'syncing',
    pending:        'pending',
    holding:        'holding',
    running:        'running',
    success:        'success',
    downloaded:     'downloaded',
    failed:         'failed',
    preempted:      'preempted',
  }
  const status = (statusMap[j.status] ?? j.status) as JobStatus

  return {
    id:          j.jobNumber,
    internalId:  j.id,
    user:        'user',
    status,
    project:     (j.manifest?.project ?? 'Default'),
    title:       j.title,
    priority:    j.priority ?? 5,
    cores:       4,
    memory:      '16 GB',
    preemptible: true,
    progress,
    tasks:       (j.taskCount != null && j.taskCount > 0) ? j.taskCount : total,
    avgFrame:    fmtAvgFrame(j.avgFrameSec),
    created:     j.createdAt,
    cost:        j.costUsd ?? 0,
  }
}

export default function JobsPage() {
  const router = useRouter()
  const { data, loading, syncing, error, refetch } = useApiFetch(() => jobsApi.list())

  const [rerenderJob, setRerenderJob] = useState<{ jobNumber: string; title: string; frames: string } | null>(null)
  const [sameFrameJob, setSameFrameJob] = useState<{ jobNumber: string; frames: string; title: string } | null>(null)
  const [sameFrameLoading, setSameFrameLoading] = useState(false)

  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    const timer = setInterval(() => { refetchRef.current() }, 5000)
    return () => clearInterval(timer)
  }, [])

  const mappedJobs   = useMemo(() => (data ?? []).map(mapJob), [data])
  const runningCount = mappedJobs.filter(j => j.status === 'running').length

  const handleActionDone = useCallback((job?: Job, action?: string) => {
    if (action === 'rerender' && job) {
      const apiJob = (data ?? []).find(j => j.jobNumber === job.id)
      if (apiJob) {
        setRerenderJob({ jobNumber: String(apiJob.jobNumber), title: String(apiJob.title), frames: String(apiJob.frames) })
      }
      return
    }
    if (action === 'rerender-same' && job) {
      const apiJob = (data ?? []).find(j => j.jobNumber === job.id)
      if (apiJob) {
        setSameFrameJob({ jobNumber: String(apiJob.jobNumber), title: String(apiJob.title), frames: String(apiJob.frames) })
      }
      return
    }
    refetch()
  }, [refetch, data])

  useEffect(() => {
    if (!isLoggedIn() && !loading) router.push('/login')
  }, [loading, router])

  if (!isLoggedIn() && !loading) return null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Jobs</h1>
          {!loading && (
            <div className="mt-2 flex items-center gap-2">
              {runningCount > 0 ? (
                <span className="jobs-running-chip">
                  <span className="jobs-running-dot" aria-hidden="true" />
                  {runningCount} Running Instance{runningCount !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="jobs-idle-chip">No running instances</span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-4 py-3">
          {error === 'Not authenticated'
            ? 'Please log in to view jobs.'
            : `Failed to load jobs: ${error}`}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 py-12 text-center">Loading jobs…</div>
      ) : (
        <JobsTable jobs={mappedJobs} onActionDone={handleActionDone} />
      )}

      {syncing && (
        <div className="jobs-sync-pill">
          <span className="jobs-sync-dot" />
          Processing
        </div>
      )}

      {/* Re-render modal (full) */}
      {rerenderJob && (
        <ReRenderModal
          jobNumber={rerenderJob.jobNumber}
          jobTitle={rerenderJob.title}
          originalFrames={rerenderJob.frames}
          onClose={() => { setRerenderJob(null); refetch() }}
        />
      )}

      {/* Re-render same frames — quick confirm */}
      {sameFrameJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setSameFrameJob(null) }}>
          <div className="bg-[#14161c] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-2">Re-render same frames?</h2>
            <p className="text-sm text-gray-400 mb-5">
              Re-submit <span className="text-gray-200 font-mono">{sameFrameJob.jobNumber}</span> with the same
              settings and frame range <span className="font-mono text-gray-200">{sameFrameJob.frames}</span>.
              No upload needed — files are already on the farm.
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setSameFrameJob(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
                Cancel
              </button>
              <button type="button" disabled={sameFrameLoading}
                onClick={async () => {
                  setSameFrameLoading(true)
                  try {
                    const token = getToken() ?? ''
                    const res = await fetch(`/api/jobs/${sameFrameJob.jobNumber}/rerender`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ frame_range: sameFrameJob.frames }),
                    })
                    const data = await res.json() as { jobNumber?: string; message?: string }
                    if (res.ok) {
                      setSameFrameJob(null)
                      router.push(`/jobs/${data.jobNumber}`)
                    }
                  } finally {
                    setSameFrameLoading(false)
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">
                {sameFrameLoading ? 'Submitting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
