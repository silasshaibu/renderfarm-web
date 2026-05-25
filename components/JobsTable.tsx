'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Job, SortKey, SortDir } from '@/types/job'
import StatusBadge from '@/components/StatusBadge'
import ProgressBar from '@/components/ProgressBar'
import { getToken } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Instance Type catalogue — loaded from /api/instance-types on first use
// ---------------------------------------------------------------------------
interface InstanceTypeSpec {
  id: string; label: string; cores: number; memoryGb: number
  gpuType: string | null; gpus: number; pricePerHour: number; preemptible: boolean
}

// Shared cache so the list is only fetched once per page load
let _instanceTypeCache: InstanceTypeSpec[] | null = null

async function fetchInstanceTypes(token: string | null): Promise<InstanceTypeSpec[]> {
  if (_instanceTypeCache) return _instanceTypeCache
  try {
    const res = await fetch('/api/instance-types', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (res.ok) {
      _instanceTypeCache = await res.json() as InstanceTypeSpec[]
      return _instanceTypeCache
    }
  } catch { /* ignore — fall through to defaults */ }
  // Fallback catalogue if API is unavailable
  return [
    { id: 'n1-standard-4',  label: 'Standard 4-core',  cores: 4,  memoryGb: 15, gpuType: null,               gpus: 0, pricePerHour: 0.19, preemptible: true  },
    { id: 'gpu-t4-1',       label: '1× T4 GPU',         cores: 4,  memoryGb: 15, gpuType: 'NVIDIA_TESLA_T4',  gpus: 1, pricePerHour: 0.85, preemptible: true  },
    { id: 'gpu-a100-1',     label: '1× A100 GPU',        cores: 12, memoryGb: 85, gpuType: 'NVIDIA_A100',      gpus: 1, pricePerHour: 3.50, preemptible: false },
    { id: 'gpu-v100-1',     label: '1× V100 GPU',        cores: 8,  memoryGb: 61, gpuType: 'NVIDIA_TESLA_V100',gpus: 1, pricePerHour: 2.48, preemptible: true  },
  ]
}

// ---------------------------------------------------------------------------
// Instance Type modal
// ---------------------------------------------------------------------------
interface InstanceTypeModalProps {
  job: Job
  onClose: () => void
  onSave: (job: Job, instanceId: string, gpuType: string | null, gpus: number) => void
}

function InstanceTypeModal({ job, onClose, onSave }: InstanceTypeModalProps) {
  const [instances,    setInstances]    = useState<InstanceTypeSpec[]>([])
  const [selectedId,   setSelectedId]   = useState<string>('')
  const [loading,      setLoading]      = useState(true)

  // Load catalogue on mount
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') : null
    fetchInstanceTypes(token).then(list => {
      setInstances(list)
      setSelectedId(list[0]?.id ?? '')
      setLoading(false)
    })
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const spec = instances.find(i => i.id === selectedId) ?? instances[0]

  return (
    <div className="edit-modal-overlay" aria-modal="true" role="dialog"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal-card">
        <div className="edit-modal-header">Instance Type</div>
        <div className="edit-modal-body">

          {loading ? (
            <p className="text-xs text-gray-500 py-4 text-center">Loading instance types…</p>
          ) : (
            <>
              {/* Instance selector */}
              <div className="edit-modal-field">
                <label htmlFor="instance-type-select" className="edit-modal-label">Instance Type</label>
                <select id="instance-type-select" className="edit-modal-select"
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}>
                  {/* Group by CPU / GPU */}
                  <optgroup label="CPU">
                    {instances.filter(i => i.gpus === 0).map(i => (
                      <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="GPU">
                    {instances.filter(i => i.gpus > 0).map(i => (
                      <option key={i.id} value={i.id}>{i.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {spec && (
                <>
                  {/* Cores — read-only */}
                  <div className="edit-modal-field">
                    <span className="edit-modal-label">Cores</span>
                    <span className="edit-modal-value">{spec.cores}</span>
                  </div>
                  {/* Memory — read-only */}
                  <div className="edit-modal-field">
                    <span className="edit-modal-label">Memory</span>
                    <span className="edit-modal-value">{spec.memoryGb} GB</span>
                  </div>
                  {/* GPUs — read-only when fixed by instance */}
                  {spec.gpus > 0 && (
                    <div className="edit-modal-field">
                      <span className="edit-modal-label">GPUs</span>
                      <span className="edit-modal-value">{spec.gpus}× {spec.gpuType?.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {/* Price */}
                  <div className="edit-modal-field">
                    <span className="edit-modal-label">Price</span>
                    <span className="edit-modal-value">${spec.pricePerHour.toFixed(2)}/hr{spec.preemptible ? ' (spot)' : ''}</span>
                  </div>
                </>
              )}
            </>
          )}

        </div>

        <div className="edit-modal-footer">
          <span className="edit-modal-job-label">Job {job.id}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="edit-modal-ok" disabled={loading || !spec}
              onClick={() => {
                if (spec) onSave(job, spec.id, spec.gpuType, spec.gpus)
                onClose()
              }}>
              Ok
            </button>
            <button type="button" className="edit-modal-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Priority modal
// ---------------------------------------------------------------------------
interface PriorityModalProps {
  job: Job
  onClose: () => void
  onSave: (job: Job, priority: number) => void
}

function PriorityModal({ job, onClose, onSave }: PriorityModalProps) {
  const [priority, setPriority] = useState(job.priority ?? 5)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="edit-modal-overlay" aria-modal="true" role="dialog"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="edit-modal-card edit-modal-card--sm">
        <div className="edit-modal-header">Priority</div>
        <div className="edit-modal-body">
          <div className="edit-modal-field">
            <label htmlFor="priority-input" className="edit-modal-label">Priority</label>
            <input id="priority-input" type="number" min={1} max={100}
              className="edit-modal-input-num"
              value={priority}
              onChange={e => setPriority(Number(e.target.value))} />
          </div>
          <p className="edit-modal-hint">
            Higher number = higher priority among your own jobs.
          </p>
        </div>

        <div className="edit-modal-footer">
          <span className="edit-modal-job-label">Job {job.id}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="edit-modal-ok"
              onClick={() => { onSave(job, priority); onClose() }}>
              Ok
            </button>
            <button type="button" className="edit-modal-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Context menu — matches Conductor's right-click menu exactly
// ---------------------------------------------------------------------------
interface CtxMenuProps {
  x: number
  y: number
  job: Job
  onClose:        () => void
  onAction:       (job: Job, next: string) => void
  onInstanceType: (job: Job) => void
  onPriority:     (job: Job) => void
}

function ContextMenu({ x, y, job, onClose, onAction, onInstanceType, onPriority }: CtxMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Position imperatively — avoids JSX style prop linter warning
  useEffect(() => {
    if (!ref.current) return
    const top  = Math.min(y, window.innerHeight - 340)
    const left = Math.min(x, window.innerWidth  - 220)
    ref.current.style.setProperty('top',  `${top}px`)
    ref.current.style.setProperty('left', `${left}px`)
  }, [x, y])

  // Close on outside click or Escape
  useEffect(() => {
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent)    => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  const isHolding = job.status === 'holding'

  /** Convenience: action button with tooltip */
  const btn = (label: string, next: string, tip: string) => (
    <button type="button" className="ctx-menu-item" title={tip}
      onClick={() => { onAction(job, next); onClose() }}>
      {label}
    </button>
  )

  return (
    <div ref={ref} className="ctx-menu">

      {/* Hold */}
      <button type="button"
        title="Pauses tasks without cancelling them. Tasks can be unholded later."
        className={`ctx-menu-item${isHolding ? ' ctx-menu-item--disabled' : ''}`}
        disabled={isHolding}
        onClick={() => { if (!isHolding) { onAction(job, 'holding'); onClose() } }}>
        Hold
      </button>

      {btn('Kill',
        'failed',
        'Hard termination — stops all running tasks immediately with no retry.')}

      {btn('Retry',
        'queued',
        'Re-queues every task in the job from scratch, regardless of current state.')}

      {btn('Retry Failed',
        'queued',
        'Restarts only failed tasks (non-zero return code). Leaves successful tasks untouched.')}

      {btn('Retry Preempted',
        'queued',
        'Restarts only tasks interrupted by cloud preemption on spot instances.')}

      {btn('Retry Sync',
        'queued',
        'Retries the asset-sync phase. Use when files failed to transfer to render nodes (sync_failed).')}

      {/* Reviewed — bookkeeping flag, no execution change */}
      <button type="button" className="ctx-menu-item"
        title="Marks the job as reviewed. Bookkeeping only — does not affect rendering."
        onClick={() => onClose()}>
        Reviewed
      </button>

      {/* Unhold — only enabled when job is on hold */}
      <button type="button"
        title={isHolding
          ? 'Releases held tasks back into the queue.'
          : 'Only available when the job is on hold.'}
        className={`ctx-menu-item${!isHolding ? ' ctx-menu-item--disabled' : ''}`}
        disabled={!isHolding}
        onClick={() => { if (isHolding) { onAction(job, 'queued'); onClose() } }}>
        Unhold
      </button>

      <div className="ctx-menu-divider" />

      {/* Edit → with submenu — no nested menuitem roles to satisfy ARIA parent rule */}
      <div className="ctx-menu-submenu-wrap">
        <button type="button" className="ctx-menu-item ctx-menu-item--has-sub">
          Edit
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <div className="ctx-submenu">
          <button type="button" className="ctx-menu-item"
            title="Run the job on a different render node type. Only affects tasks that have not yet run."
            onClick={() => { onInstanceType(job); onClose() }}>
            Instance Type
          </button>
          <button type="button" className="ctx-menu-item"
            title="Change job priority. Higher number = higher priority among your own jobs."
            onClick={() => { onPriority(job); onClose() }}>
            Priority
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------
interface Column {
  key: SortKey | '_actions'
  label: string
  sortable: boolean
  align?: 'right' | 'center'
  widthClass?: string
}

const COLUMNS: Column[] = [
  { key: 'id',          label: 'JOB ID',      sortable: true,  widthClass: 'col-w-sm'  },
  { key: 'user',        label: 'USER',        sortable: true                             },
  { key: 'status',      label: 'STATUS',      sortable: true                             },
  { key: 'project',     label: 'PROJECT',     sortable: true,  widthClass: 'col-w-lg'  },
  { key: 'title',       label: 'TITLE',       sortable: true,  widthClass: 'col-w-xl'  },
  { key: 'priority',    label: 'PRIORITY',    sortable: true,  align: 'right'           },
  { key: 'cores',       label: 'CORES',       sortable: true,  align: 'right'           },
  { key: 'memory',      label: 'MEMORY',      sortable: true,  align: 'right'           },
  { key: 'preemptible', label: 'PREEMPTIBLE', sortable: true,  align: 'center'          },
  { key: 'progress',    label: 'PROGRESS',    sortable: true,  widthClass: 'col-w-md'  },
  { key: 'tasks',       label: 'TASKS',       sortable: true,  align: 'right'           },
  { key: 'avgFrame',    label: 'AVG FRAME',   sortable: true,  align: 'right'           },
  { key: 'cost',        label: 'COST',        sortable: true,  align: 'right'           },
  { key: 'created',     label: 'CREATED',     sortable: true,  widthClass: 'col-w-lg'  },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'UTC',
    }).format(new Date(iso))
  } catch { return iso }
}

function sortJobs(jobs: Job[], key: SortKey, dir: SortDir): Job[] {
  return [...jobs].sort((a, b) => {
    const av = a[key], bv = b[key]
    let cmp = 0
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
    else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv)
    else cmp = String(av).localeCompare(String(bv))
    return dir === 'asc' ? cmp : -cmp
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-flex ${active ? 'text-blue-400' : 'text-gray-600'}`}>
      <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden="true">
        <path d="M4 0L8 4H0L4 0Z"   opacity={active && dir === 'asc'  ? 1 : 0.35} />
        <path d="M4 10L0 6H8L4 10Z" opacity={active && dir === 'desc' ? 1 : 0.35} />
      </svg>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Columns popover
// ---------------------------------------------------------------------------
const COLUMNS_BTN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
)

function ColumnsPopover({ visible, onToggle }: { visible: Set<SortKey | '_actions'>; onToggle: (k: SortKey | '_actions') => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      {open ? (
        <button type="button" aria-expanded="true" className="col-popover-btn" onClick={() => setOpen(false)}>
          {COLUMNS_BTN_ICON} Columns
        </button>
      ) : (
        <button type="button" aria-expanded="false" className="col-popover-btn" onClick={() => setOpen(true)}>
          {COLUMNS_BTN_ICON} Columns
        </button>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="col-popover-panel" aria-label="Toggle columns">
            {COLUMNS.map(col => (
              <label key={col.key}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 cursor-pointer">
                <input type="checkbox" className="accent-blue-500"
                  checked={visible.has(col.key)} onChange={() => onToggle(col.key)} />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// <th>
// ---------------------------------------------------------------------------
function Th({ col, sortKey: sk, sortDir: sd, onSort }: { col: Column; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const isSortable = col.sortable && col.key !== '_actions'
  const isActive   = sk === col.key
  const cls = ['jobs-th', isSortable ? 'sortable' : '', col.align ?? '', col.widthClass ?? ''].join(' ')
  const icon = isSortable ? <SortIcon active={isActive} dir={isActive ? sd : 'asc'} /> : null
  const click = isSortable ? () => onSort(col.key as SortKey) : undefined
  if (isActive && sd === 'asc')  return <th scope="col" className={cls} aria-sort="ascending"  onClick={click}>{col.label}{icon}</th>
  if (isActive && sd === 'desc') return <th scope="col" className={cls} aria-sort="descending" onClick={click}>{col.label}{icon}</th>
  return <th scope="col" className={cls} onClick={click}>{col.label}{icon}</th>
}

// ---------------------------------------------------------------------------
// Pagination button
// ---------------------------------------------------------------------------
function PagBtn({ label, ariaLabel, onClick, disabled = false, active = false }: { label: string; ariaLabel?: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  const isWord = label === 'Previous' || label === 'Next'
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={ariaLabel} aria-current={active ? 'page' : undefined}
      className={['px-3 py-1.5 rounded text-xs font-medium transition-colors border',
        isWord ? 'min-w-[80px]' : 'min-w-[28px]',
        active ? 'bg-blue-600 border-blue-600 text-white'
          : disabled ? 'border-white/5 text-gray-700 cursor-not-allowed bg-transparent'
          : 'border-white/10 text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/5',
      ].join(' ')}>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Cell renderer
// ---------------------------------------------------------------------------
function CellContent({ col, job }: { col: Column; job: Job }) {
  switch (col.key) {
    case 'id':
      return (
        <a href={`/jobs/${job.id}`}
          className="font-mono font-semibold text-blue-400 hover:text-blue-300 hover:underline"
          onClick={e => e.stopPropagation()}>
          {job.id}
        </a>
      )
    case 'status':      return <StatusBadge status={job.status} />
    case 'progress':    return <ProgressBar value={job.progress} />
    case 'preemptible':
      return (
        <span className={['inline-flex items-center justify-center w-5 h-5 rounded text-xs border',
          job.preemptible ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'border-white/10 text-gray-700',
        ].join(' ')} aria-label={job.preemptible ? 'Yes' : 'No'}>
          {job.preemptible ? '✓' : '—'}
        </span>
      )
    case 'created':
      return <time dateTime={job.created} className="text-gray-400 font-mono text-xs">{formatDate(job.created)}</time>
    case 'memory':   return <span className="font-mono text-gray-300">{job.memory}</span>
    case 'avgFrame': return <span className="font-mono text-gray-300">{job.avgFrame}</span>
    case 'cost': {
      const c = job.cost ?? 0
      return (
        <span className={`font-mono text-xs ${c > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
          {c > 0 ? `$${c.toFixed(3)}` : '—'}
        </span>
      )
    }
    default: {
      const val = job[col.key as SortKey]
      return <span className="text-gray-300">{String(val)}</span>
    }
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface JobsTableProps {
  jobs: Job[]
  onActionDone?: () => void   // called after any context-menu PATCH so the parent can refetch
}

export default function JobsTable({ jobs, onActionDone }: JobsTableProps) {
  const [search,      setSearch]      = useState('')
  const [pageSize,    setPageSize]    = useState<PageSize>(10)
  const [page,        setPage]        = useState(1)
  const [sortKey,     setSortKey]     = useState<SortKey>('created')
  const [sortDir,     setSortDir]     = useState<SortDir>('desc')
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; job: Job } | null>(null)
  const [itModal,     setItModal]     = useState<Job | null>(null)   // Instance Type
  const [priModal,    setPriModal]    = useState<Job | null>(null)   // Priority
  const [actionError, setActionError] = useState<string | null>(null)

  const DEFAULT_HIDDEN = new Set<SortKey | '_actions'>(['project', 'title', 'progress', 'cost'])
  const [visibleCols, setVisibleCols] = useState<Set<SortKey | '_actions'>>(
    new Set(COLUMNS.map(c => c.key).filter(k => !DEFAULT_HIDDEN.has(k)))
  )

  const filtered   = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(job => Object.values(job).some(v => String(v).toLowerCase().includes(q)))
  }, [jobs, search])

  const sorted     = useMemo(() => sortJobs(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleSort     = useCallback((key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }, [sortKey])

  const handleSearch   = useCallback((e: React.ChangeEvent<HTMLInputElement>)  => { setSearch(e.target.value); setPage(1) }, [])
  const handlePageSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => { setPageSize(Number(e.target.value) as PageSize); setPage(1) }, [])
  const toggleCol      = useCallback((key: SortKey | '_actions') => {
    setVisibleCols(prev => {
      const next = new Set(prev)
      if (next.has(key) && next.size > 1) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  // ── PATCH helpers ───────────────────────────────────────────────────────────
  const patch = useCallback(async (job: Job, body: Record<string, unknown>) => {
    const token = getToken()
    if (!token) { setActionError('Not authenticated — please log in again.'); return }

    setActionError(null)
    try {
      const res = await fetch(`/api/jobs?id=${job.internalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }))
        setActionError(`Action failed: ${err.message ?? res.statusText}`)
        return
      }
      // Success — tell the parent to refetch immediately
      onActionDone?.()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Network error — action may not have saved.')
    }
  }, [onActionDone])

  const handleContextAction  = useCallback((job: Job, next: string) => patch(job, { status: next }), [patch])
  const handleInstanceTypeSave = useCallback(
    (job: Job, instanceId: string, gpuType: string | null, gpus: number) =>
      patch(job, {
        manifest: {
          instance_type: instanceId,
          gpu_type:      gpuType ?? undefined,
          gpus:          gpus > 0 ? gpus : undefined,
          machine_type:  gpus > 0 ? 'GPU' : 'CPU',
        },
      }),
    [patch]
  )
  const handlePrioritySave   = useCallback((job: Job, priority: number) => patch(job, { priority }), [patch])

  const visibleColumns = COLUMNS.filter(c => visibleCols.has(c.key))
  const startItem = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endItem   = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="flex flex-col gap-4">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <label htmlFor="page-size" className="sr-only">Entries per page</label>
          <span aria-hidden="true">Show</span>
          <select id="page-size" title="Entries per page" value={pageSize}
            onChange={handlePageSize} className="table-input px-2 py-1.5">
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span aria-hidden="true">entries</span>
        </div>

        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="search" id="jobs-search" placeholder="Search…"
            value={search} onChange={handleSearch} aria-label="Search jobs"
            className="table-input w-full pl-8 pr-3 py-1.5" />
        </div>

        <div className="ml-auto">
          <ColumnsPopover visible={visibleCols} onToggle={toggleCol} />
        </div>
      </div>

      {/* ── Action error banner ──────────────────────────────────────────── */}
      {actionError && (
        <div className="flex items-center justify-between gap-3 text-sm text-red-400
                        bg-red-500/10 border border-red-500/20 rounded px-4 py-2.5">
          <span>{actionError}</span>
          <button type="button" className="text-red-400 hover:text-red-300 text-lg leading-none"
            onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="jobs-table-wrap" role="region" aria-label="Jobs list">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {visibleColumns.map(col => (
                <Th key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length}
                  className="px-4 py-16 text-center text-gray-600 text-sm">
                  No jobs found.
                </td>
              </tr>
            ) : (
              paginated.map(job => {
                const isSelected = selectedIds.has(job.id)
                return (
                  <tr key={job.id}
                    className={`jobs-tbody-row jobs-tbody-row--clickable${isSelected ? ' jobs-tbody-row--selected' : ''}`}
                    onClick={e => {
                      if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd: toggle this row
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          if (next.has(job.id)) next.delete(job.id); else next.add(job.id)
                          return next
                        })
                        setLastClickedId(job.id)
                      } else if (e.shiftKey && lastClickedId) {
                        // Shift: select range from lastClickedId to this row
                        const allIds = paginated.map(j => j.id)
                        const a = allIds.indexOf(lastClickedId)
                        const b = allIds.indexOf(job.id)
                        const [lo, hi] = a < b ? [a, b] : [b, a]
                        setSelectedIds(new Set(allIds.slice(lo, hi + 1)))
                      } else {
                        // Plain click: single-select (deselect if already the only one)
                        if (selectedIds.size === 1 && selectedIds.has(job.id)) {
                          setSelectedIds(new Set())
                          setLastClickedId(null)
                        } else {
                          setSelectedIds(new Set([job.id]))
                          setLastClickedId(job.id)
                        }
                      }
                    }}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, job }) }}>
                    {visibleColumns.map(col => (
                      <td key={col.key} className={['jobs-td', col.align ?? ''].join(' ')}>
                        <CellContent col={col} job={job} />
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-gray-500 flex-wrap gap-3">
        <span aria-live="polite" aria-atomic="true">
          {sorted.length === 0 ? 'No entries' : (
            <>
              Showing <span className="text-gray-300 font-medium">{startItem}–{endItem}</span>
              {' of '}
              <span className="text-gray-300 font-medium">{sorted.length}</span> entries
              {filtered.length !== jobs.length && <span className="text-gray-600"> (filtered from {jobs.length})</span>}
            </>
          )}
        </span>
        <nav aria-label="Table pagination" className="flex items-center gap-2">
          <PagBtn label="Previous" ariaLabel="Previous page"
            disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <span>Page</span>
            <input type="number" min={1} max={totalPages} value={safePage}
              aria-label="Current page"
              onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setPage(v) }}
              className="table-input w-12 px-2 py-1 text-center text-gray-200 text-sm" />
            <span>of {totalPages}</span>
          </div>
          <PagBtn label="Next" ariaLabel="Next page"
            disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
        </nav>
      </div>

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} job={contextMenu.job}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
          onInstanceType={job => { setItModal(job) }}
          onPriority={job => { setPriModal(job) }}
        />
      )}

      {/* ── Instance Type modal ───────────────────────────────────────────── */}
      {itModal && (
        <InstanceTypeModal
          job={itModal}
          onClose={() => setItModal(null)}
          onSave={handleInstanceTypeSave}
        />
      )}

      {/* ── Priority modal ────────────────────────────────────────────────── */}
      {priModal && (
        <PriorityModal
          job={priModal}
          onClose={() => setPriModal(null)}
          onSave={handlePrioritySave}
        />
      )}

    </div>
  )
}
