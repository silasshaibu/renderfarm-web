// ---------------------------------------------------------------------------
// Core domain types — mirrors all 12 Conductor job statuses
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'upload_pending'  // job spec submitted, data not yet uploading
  | 'uploading'       // data transfer to cloud storage underway
  | 'sync_pending'    // high-performance storage cluster being deployed
  | 'sync_failed'     // asset sync to render nodes failed — needs Retry Sync
  | 'syncing'         // data copying from cloud to high-speed storage
  | 'pending'         // render node allocation in progress
  | 'holding'         // paused — user must unhold to continue
  | 'running'         // active task execution
  | 'success'         // all tasks rendered successfully
  | 'downloaded'      // successful outputs retrieved
  | 'failed'          // at least one task unsuccessful
  | 'preempted'       // interrupted by cloud provider (spot instance reclaimed)

export interface Job {
  id:          string   // jobNumber e.g. "RF-0001"
  internalId:  string   // DB UUID — used for PATCH calls
  user:        string
  status:      JobStatus
  project:     string
  title:       string
  priority:    number
  cores:       number
  memory:      string
  preemptible: boolean
  progress:    number   // 0–100
  tasks:       number
  avgFrame:    string   // e.g. "9m 32s"
  created:     string   // ISO date string
  cost?:       number   // USD, computed from task timing
}

// Software identifiers sent by DCC submitters
export type JobSoftware =
  | 'blender-3-3-lts' | 'blender-3-4' | 'blender-3-5' | 'blender-3-6-lts'
  | 'blender-4-0'     | 'blender-4-1' | 'blender-4-2-lts'
  | 'maya-2022'    | 'maya-2023'    | 'maya-2024'    | 'maya-2025'
  | 'houdini-19.5' | 'houdini-20.0' | 'houdini-20.5'
  | 'cinema4d-2023' | 'cinema4d-2024' | 'cinema4d-2025'
  | '3dsmax-2022'  | '3dsmax-2023'  | '3dsmax-2024'  | '3dsmax-2025'
  | (string & {})   // allow future values without breaking existing code

// Table sort direction
export type SortDir = 'asc' | 'desc'

// Column keys that the table can sort by
export type SortKey = keyof Job
