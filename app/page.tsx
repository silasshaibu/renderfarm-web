'use client'

import { useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import JobsTable from '@/components/JobsTable'
import { jobs as jobsApi, type ApiJob } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'
import { isLoggedIn } from '@/lib/auth'
import type { Job, JobStatus } from '@/types/job'

// Map API job → UI Job shape
function mapJob(j: ApiJob): Job {
  // Count frames from "1-250" style range
  const parts  = j.frames?.replace(/\s/g, '').split('-') ?? ['1']
  const start  = parseInt(parts[0]) || 1
  const end    = parts.length > 1 ? parseInt(parts[1]) || start : start
  const total  = end - start + 1
  const done   = j.status === 'done' ? total : 0
  const progress = j.status === 'done' ? 100 : j.status === 'running' ? 50 : 0

  const statusMap: Record<string, JobStatus> = {
    done:      'downloaded',
    queued:    'pending',
    failed:    'failed',
    running:   'running',
    holding:   'holding',
    uploading: 'pending',
  }
  const status = (statusMap[j.status] ?? j.status) as JobStatus

  return {
    id:          j.jobNumber,
    user:        'user',
    status,
    project:     'Default',
    title:       j.title,
    priority:    5,
    cores:       4,
    memory:      '16 GB',
    preemptible: true,
    progress,
    tasks:       total,
    avgFrame:    '—',
    created:     j.createdAt,
  }
}

export default function JobsPage() {
  const router = useRouter()
  const { data, loading, error } = useApiFetch(() => jobsApi.list())

  const mappedJobs = useMemo(() => (data ?? []).map(mapJob), [data])
  const runningCount = mappedJobs.filter((j) => j.status === 'running').length

  useEffect(() => {
    if (!isLoggedIn() && !loading) {
      router.push('/login')
    }
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
        <a href="/submit" className="btn-submit-job">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Submit Job
        </a>
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
        <JobsTable jobs={mappedJobs} />
      )}
    </div>
  )
}
