'use client'

import { useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import JobsTable from '@/components/JobsTable'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'
import { isLoggedIn } from '@/lib/auth'
import type { Job, JobStatus } from '@/types/job'

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
    tasks:       total,
    avgFrame:    '—',
    created:     j.createdAt,
    cost:        j.costUsd ?? 0,
  }
}

export default function JobsPage() {
  const router = useRouter()
  const { data, loading, syncing, error, refetch } = useApiFetch(() => jobsApi.list())

  // ── Poll every 5 s (same as job-detail page) ────────────────────────────────
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch          // always up-to-date without re-running effect

  useEffect(() => {
    const timer = setInterval(() => { refetchRef.current() }, 5000)
    return () => clearInterval(timer)
  }, [])

  const mappedJobs   = useMemo(() => (data ?? []).map(mapJob), [data])
  const runningCount = mappedJobs.filter(j => j.status === 'running').length

  // Called by JobsTable after any context-menu action so the list refreshes immediately
  const handleActionDone = useCallback(() => { refetch() }, [refetch])

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

      {/* Small syncing indicator — shown during background polls, never blinks the table */}
      {syncing && (
        <div className="jobs-sync-pill">
          <span className="jobs-sync-dot" />
          Processing
        </div>
      )}
    </div>
  )
}
