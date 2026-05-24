// ---------------------------------------------------------------------------
// Core domain types for the Conductor Render Farm dashboard
// ---------------------------------------------------------------------------

export type JobStatus = 'running' | 'downloaded' | 'failed' | 'pending' | 'holding'

export interface Job {
  id: string
  user: string
  status: JobStatus
  project: string
  title: string
  priority: number
  cores: number
  memory: string
  preemptible: boolean
  progress: number     // 0–100
  tasks: number
  avgFrame: string     // e.g. "9m 32s"
  created: string      // ISO date string
}

// Table sort direction
export type SortDir = 'asc' | 'desc'

// Column keys that the table can sort by
export type SortKey = keyof Job
