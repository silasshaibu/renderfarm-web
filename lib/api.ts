/**
 * Renderfarm API client
 * All calls go through this module — swap BASE_URL for production.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('rf_token')
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  login: (email: string, password: string) =>
    request<{ access_token: string; user: { id: string; email: string; isAdmin: boolean } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }
    ),

  register: (name: string, email: string, password: string) =>
    request<{ access_token: string }>('/auth/register', {
      method: 'POST', body: JSON.stringify({ name, email, password })
    }),

  me: () => request<{ id: string; name: string; email: string; isAdmin: boolean }>('/auth/me'),
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projects = {
  list: () =>
    request<{ id: string; name: string; isActive: boolean; users: number; jobs: number; storageGb: number; createdAt: string }[]>('/projects'),

  get: (id: string) => request<{ id: string; name: string }>(`/projects/${id}`),

  create: (name: string) =>
    request('/projects', { method: 'POST', body: JSON.stringify({ name }) }),

  update: (id: string, data: { name?: string; isActive?: boolean }) =>
    request(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  remove: (id: string) =>
    request(`/projects/${id}`, { method: 'DELETE' }),
}

// ── Manifest (Blender addon submission payload) ───────────────────────────────
export interface ManifestAsset {
  path:       string        // original path on artist's machine
  sha256:     string        // content hash for dedup
  size_bytes: number
  type:       'blend' | 'texture' | 'hdri' | 'font' | 'cache' | 'other'
  blob_url?:  string        // resolved after upload to Vercel Blob
}

export interface ManifestData {
  scene:           string
  blender_version: string
  renderer:        'CYCLES' | 'EEVEE' | 'WORKBENCH' | string
  instance_type:   string   // e.g. "n1-standard-8"
  machine_type?:   string   // e.g. "GPU" | "CPU"
  gpu_type?:       string   // e.g. "NVIDIA_TESLA_T4"
  gpus?:           number
  frame_start:     number
  frame_end:       number
  chunk_size:      number
  output_path?:    string   // destination on artist's machine (for Companion)
  project?:        string
  preemptible?:    boolean
  cores?:          number
  memory_gb?:      number
  assets:          ManifestAsset[]
}

// ── Jobs ──────────────────────────────────────────────────────────────────────
// Shape returned by our /api/jobs route
export interface ApiJob {
  id:                string
  jobNumber:         string
  title:             string
  status:            // Legacy DB names
                   | 'queued' | 'done'
                   // All 12 Conductor statuses
                   | 'upload_pending' | 'uploading' | 'sync_pending' | 'sync_failed'
                   | 'syncing' | 'pending' | 'holding' | 'running'
                   | 'success' | 'downloaded' | 'failed' | 'preempted'
  frames:            string
  software:          string
  createdAt:         string
  blenderFile:       string
  outputs:           string[]
  priority?:         number
  manifest?:         ManifestData
  assetsTotal?:      number
  assetsUploaded?:   number
  outputPath?:       string   // e.g. "C:/Users/Artist/render"
  workerHost?:       string   // hostname of the render worker that picked up the job
  statusDescription?: string  // human-readable detail (e.g. "Waiting for GPU worker")
}

export const jobs = {
  list: () => request<ApiJob[]>('/jobs'),

  get: (jobNumber: string) => request<ApiJob>(`/jobs?jobNumber=${jobNumber}`),

  create: (data: { title: string; frames: string; software: string; blender_file?: string }) =>
    request<{ jobNumber: string; id: string }>('/jobs', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { status?: string; outputs?: string[] }) =>
    request<ApiJob>(`/jobs?id=${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export interface ApiTask {
  id: string; taskNumber: string; status: string
  outputPath: string | null
  startedAt: string | null
  completedAt: string | null
  uploadedFiles: { id: string; path: string }[]
  executions: { id: string; attempt: number; status: string; startedAt: string | null; duration: number | null }[]
}

export const tasks = {
  list: (jobNumber: string) =>
    request<ApiTask[]>(`/jobs/${jobNumber}/tasks`),

  get: (jobNumber: string, taskNumber: string) =>
    request<{ job: ApiJob; task: ApiTask }>(`/jobs/${jobNumber}/tasks/${taskNumber}`),

  logs: (jobNumber: string, taskNumber: string, after?: string) =>
    request<{ id: string; line: string; level: string; timestamp: string }[]>(
      `/jobs/${jobNumber}/tasks/${taskNumber}/logs${after ? `?after=${after}` : ''}`
    ),
}

// ── Usage ─────────────────────────────────────────────────────────────────────
export interface UsageRecord {
  id: string; coreHours: number; gpuHours: number; licenseFee: number; total: number; date: string
  job: { jobNumber: string; title: string; project: { name: string } }
}

export const usage = {
  get: (rangeDays?: number, projectId?: string) =>
    request<{ records: UsageRecord[]; summary: { totalCost: number; totalCoreHours: number; totalJobs: number; avgCostPerJob: number } }>(
      `/usage${rangeDays ? `?range=${rangeDays}` : ''}${projectId ? `&projectId=${projectId}` : ''}`
    ),

  chart: (rangeDays = 30) =>
    request<{ date: string; accountSpend: number; coreHours: number; storageSpend: number }[]>(
      `/usage/chart?range=${rangeDays}`
    ),
}

// ── Payments ──────────────────────────────────────────────────────────────────
export interface ApiTransaction {
  id: string; date: string; description: string; cardType: string; cardNumber: string
  type: string; status: string; bonusCredit: number; amount: number; authCode: string | null
}

export const payments = {
  transactions: () => request<ApiTransaction[]>('/payments/transactions'),

  cards: () =>
    request<{ id: string; brand: string; number: string; exp: string; isDefault: boolean }[]>('/payments/cards'),

  addCard: (data: { brand: string; number: string; exp: string }) =>
    request('/payments/cards', { method: 'POST', body: JSON.stringify(data) }),

  removeCard: (id: string) =>
    request(`/payments/cards/${id}`, { method: 'DELETE' }),

  setDefault: (id: string) =>
    request(`/payments/cards/${id}/default`, { method: 'PATCH' }),

  period: () =>
    request<{ startDate: string; endDate: string; carryOver: number; amountSpent: number; amountCharged: number; outstandingBalance: number }>(
      '/payments/period'
    ),
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  users: (filter?: string, status?: string) =>
    request<{ id: string; name: string; email: string; isAdmin: boolean; isActive: boolean }[]>(
      `/admin/users${filter || status ? `?${new URLSearchParams({ ...(filter ? { filter } : {}), ...(status ? { status } : {}) })}` : ''}`
    ),

  updateUser: (id: string, data: { isActive?: boolean; isAdmin?: boolean }) =>
    request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  limits: () => request('/admin/limits'),

  createLimit: (data: object) =>
    request('/admin/limits', { method: 'POST', body: JSON.stringify(data) }),

  deleteLimit: (id: string) =>
    request(`/admin/limits/${id}`, { method: 'DELETE' }),

  sessions: () => request('/admin/sessions'),

  terminateSession: (id: string) =>
    request(`/admin/sessions/${id}`, { method: 'DELETE' }),

  storage: () => request('/admin/storage/summary'),
}
