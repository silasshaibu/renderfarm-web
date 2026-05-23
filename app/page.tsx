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
  const total      = j.tasks.length
  const done       = j.tasks.filter((t) => t.status === 'downloaded' || t.status === 'completed').length
  const progress   = total > 0 ? Math.round((done / total) * 100) : 0

  const statusMap: Record<string, JobStatus> = {
    completed: 'downloaded',
    queued:    'pending',
    cancelled: 'failed',
  }
  const status = (statusMap[j.status] ?? j.status) as JobStatus

  return {
    id:          j.jobNumber,
    user:        j.user.name.toLowerCase(),
    status,
    project:     j.project.name,
    title:       j.title,
    priority:    5,
    cores:       j.cores,
    memory:      '64 GB',
    preemptible: j.gpuCount === 0,
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
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Jobs</h1>
        <p className="mt-1 text-sm text-gray-500">
          {loading ? 'Loading…' : `${runningCount} Running Instance${runningCount !== 1 ? 's' : ''}`}
        </p>
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
