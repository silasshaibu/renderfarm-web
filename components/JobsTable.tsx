'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Job, SortKey, SortDir } from '@/types/job'
import StatusBadge from '@/components/StatusBadge'
import ProgressBar from '@/components/ProgressBar'
import { getToken } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Context-menu actions — matches Conductor's right-click menu
// ---------------------------------------------------------------------------
interface CtxAction {
  label: string
  next?: string       // new status to PATCH to
  href?: boolean      // if true → navigate to job detail
  divider?: boolean   // renders a separator line instead of a button
  disabled?: boolean
}

function getContextActions(status: string): CtxAction[] {
  const edit: CtxAction   = { label: 'Edit', href: true }
  const divider: CtxAction = { label: '', divider: true }
  const hold: CtxAction   = { label: 'Hold',   next: 'holding' }
  const unhold: CtxAction = { label: 'Unhold', next: 'queued'  }
  const kill: CtxAction   = { label: 'Kill',   next: 'failed'  }
  const retry: CtxAction  = { label: 'Retry',  next: 'queued'  }

  switch (status) {
    case 'running':
      return [hold, kill, retry, divider, edit]
    case 'holding':
      return [unhold, hold, kill, retry, divider, edit]
    case 'failed':
      return [retry, kill, divider, edit]
    case 'downloaded':
      return [retry, divider, edit]
    case 'pending':   // queued / uploading
      return [hold, kill, divider, edit]
    default:
      return [divider, edit]
  }
}

// ---------------------------------------------------------------------------
// Context menu component
// ---------------------------------------------------------------------------
interface ContextMenuProps {
  x: number
  y: number
  job: Job
  onClose: () => void
  onAction: (job: Job, next: string) => void
}

function ContextMenu({ x, y, job, onClose, onAction }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const actions = getContextActions(job.status)

  // Close on outside click or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Position the menu imperatively so no JSX style prop is needed
  useEffect(() => {
    if (!ref.current) return
    const top  = Math.min(y, window.innerHeight - 220)
    const left = Math.min(x, window.innerWidth  - 200)
    ref.current.style.setProperty('top',  `${top}px`)
    ref.current.style.setProperty('left', `${left}px`)
  }, [x, y])

  return (
    <div ref={ref} className="ctx-menu" role="menu">
      {actions.map((a, i) => {
        if (a.divider) return <div key={i} className="ctx-menu-divider" role="separator" />

        if (a.href) {
          return (
            <a key={i} href={`/jobs/${job.id}`} className="ctx-menu-item" role="menuitem"
              onClick={onClose}>
              {a.label}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </a>
          )
        }

        return (
          <button key={i} type="button" role="menuitem"
            className={`ctx-menu-item${a.disabled ? ' ctx-menu-item--disabled' : ''}`}
            disabled={a.disabled}
            onClick={() => { if (a.next) onAction(job, a.next); onClose() }}>
            {a.label}
          </button>
        )
      })}
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
  { key: 'created',     label: 'CREATED',     sortable: true,  widthClass: 'col-w-lg'  },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'UTC',
    }).format(new Date(iso))
  } catch {
    return iso
  }
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

// ---------------------------------------------------------------------------
// Sort indicator
// ---------------------------------------------------------------------------
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
// Column-visibility popover
// ---------------------------------------------------------------------------
interface ColumnsPopoverProps {
  visible: Set<SortKey | '_actions'>
  onToggle: (key: SortKey | '_actions') => void
}

const COLUMNS_BTN_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

function ColumnsPopover({ visible, onToggle }: ColumnsPopoverProps) {
  const [open, setOpen] = useState(false)

  const panel = open ? (
    <>
      <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setOpen(false)} />
      <div className="col-popover-panel" aria-label="Toggle columns">
        {COLUMNS.map((col) => (
          <label key={col.key}
            className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-gray-300 hover:bg-white/5 cursor-pointer">
            <input type="checkbox" className="accent-blue-500"
              checked={visible.has(col.key)} onChange={() => onToggle(col.key)} />
            {col.label}
          </label>
        ))}
      </div>
    </>
  ) : null

  return (
    <div className="relative">
      {open ? (
        <button type="button" aria-expanded="true" className="col-popover-btn"
          onClick={() => setOpen(false)}>
          {COLUMNS_BTN_ICON} Columns
        </button>
      ) : (
        <button type="button" aria-expanded="false" className="col-popover-btn"
          onClick={() => setOpen(true)}>
          {COLUMNS_BTN_ICON} Columns
        </button>
      )}
      {panel}
    </div>
  )
}

// ---------------------------------------------------------------------------
// <th> with static aria-sort literals
// ---------------------------------------------------------------------------
interface ThProps {
  col: Column; sortKey: SortKey; sortDir: SortDir; onSort: (key: SortKey) => void
}
function Th({ col, sortKey: sk, sortDir: sd, onSort }: ThProps) {
  const isSortable = col.sortable && col.key !== '_actions'
  const isActive   = sk === col.key
  const cls = ['jobs-th', isSortable ? 'sortable' : '', col.align ?? '', col.widthClass ?? ''].join(' ')
  const icon = isSortable ? <SortIcon active={isActive} dir={isActive ? sd : 'asc'} /> : null
  const handleClick = isSortable ? () => onSort(col.key as SortKey) : undefined

  if (isActive && sd === 'asc')  return <th scope="col" className={cls} aria-sort="ascending"  onClick={handleClick}>{col.label}{icon}</th>
  if (isActive && sd === 'desc') return <th scope="col" className={cls} aria-sort="descending" onClick={handleClick}>{col.label}{icon}</th>
  return <th scope="col" className={cls} onClick={handleClick}>{col.label}{icon}</th>
}

// ---------------------------------------------------------------------------
// Pagination button
// ---------------------------------------------------------------------------
interface PagBtnProps {
  label: string; ariaLabel?: string; onClick?: () => void; disabled?: boolean; active?: boolean
}
function PagBtn({ label, ariaLabel, onClick, disabled = false, active = false }: PagBtnProps) {
  const isWord = label === 'Previous' || label === 'Next'
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={ariaLabel} aria-current={active ? 'page' : undefined}
      className={[
        'px-3 py-1.5 rounded text-xs font-medium transition-colors border',
        isWord ? 'min-w-[80px]' : 'min-w-[28px]',
        active
          ? 'bg-blue-600 border-blue-600 text-white'
          : disabled
          ? 'border-white/5 text-gray-700 cursor-not-allowed bg-transparent'
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
        <span className={[
          'inline-flex items-center justify-center w-5 h-5 rounded text-xs border',
          job.preemptible
            ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
            : 'border-white/10 text-gray-700',
        ].join(' ')} aria-label={job.preemptible ? 'Yes' : 'No'}>
          {job.preemptible ? '✓' : '—'}
        </span>
      )
    case 'created':
      return <time dateTime={job.created} className="text-gray-400 font-mono text-xs">{formatDate(job.created)}</time>
    case 'memory':
      return <span className="font-mono text-gray-300">{job.memory}</span>
    case 'avgFrame':
      return <span className="font-mono text-gray-300">{job.avgFrame}</span>
    default: {
      const val = job[col.key as SortKey]
      return <span className="text-gray-300">{String(val)}</span>
    }
  }
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------
export interface JobsTableProps { jobs: Job[] }

export default function JobsTable({ jobs }: JobsTableProps) {
  const [search,       setSearch]       = useState('')
  const [pageSize,     setPageSize]     = useState<PageSize>(10)
  const [page,         setPage]         = useState(1)
  const [sortKey,      setSortKey]      = useState<SortKey>('created')
  const [sortDir,      setSortDir]      = useState<SortDir>('desc')
  const [selectedId,   setSelectedId]   = useState<string | null>(null)   // left-click selection
  const [contextMenu,  setContextMenu]  = useState<{ x: number; y: number; job: Job } | null>(null)

  const DEFAULT_HIDDEN = new Set<SortKey | '_actions'>(['project', 'title', 'progress'])
  const [visibleCols, setVisibleCols] = useState<Set<SortKey | '_actions'>>(
    new Set(COLUMNS.map((c) => c.key).filter((k) => !DEFAULT_HIDDEN.has(k)))
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((job) => Object.values(job).some((v) => String(v).toLowerCase().includes(q)))
  }, [jobs, search])

  const sorted   = useMemo(() => sortJobs(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handleSort = useCallback((key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }, [sortKey])

  const handleSearch   = useCallback((e: React.ChangeEvent<HTMLInputElement>)  => { setSearch(e.target.value); setPage(1) }, [])
  const handlePageSize = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => { setPageSize(Number(e.target.value) as PageSize); setPage(1) }, [])
  const toggleCol      = useCallback((key: SortKey | '_actions') => {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(key) && next.size > 1) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // ── Context-menu action → PATCH API ────────────────────────────────────────
  const handleContextAction = useCallback(async (job: Job, nextStatus: string) => {
    const token = getToken() ?? ''
    try {
      await fetch(`/api/jobs?id=${job.internalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      })
      // The parent page auto-polls every 5 s; optimistic UI isn't needed
    } catch { /* silent — next poll will reflect server state */ }
  }, [])

  const visibleColumns = COLUMNS.filter((c) => visibleCols.has(c.key))
  const startItem = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endItem   = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="flex flex-col gap-4">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <label htmlFor="page-size" className="sr-only">Entries per page</label>
          <span aria-hidden="true">Show</span>
          <select id="page-size" title="Entries per page"
            value={pageSize} onChange={handlePageSize}
            className="table-input px-2 py-1.5">
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
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

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="jobs-table-wrap" role="region" aria-label="Jobs list">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {visibleColumns.map((col) => (
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
              paginated.map((job) => {
                const isSelected = selectedId === job.id
                return (
                  <tr key={job.id}
                    className={`jobs-tbody-row jobs-tbody-row--clickable${isSelected ? ' jobs-tbody-row--selected' : ''}`}
                    /* Left click → select row */
                    onClick={() => setSelectedId(isSelected ? null : job.id)}
                    /* Right click → context menu */
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, job })
                    }}>
                    {visibleColumns.map((col) => (
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

      {/* ── Pagination footer ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-gray-500 flex-wrap gap-3">
        <span aria-live="polite" aria-atomic="true">
          {sorted.length === 0 ? 'No entries' : (
            <>
              Showing{' '}
              <span className="text-gray-300 font-medium">{startItem}–{endItem}</span>
              {' of '}
              <span className="text-gray-300 font-medium">{sorted.length}</span> entries
              {filtered.length !== jobs.length && (
                <span className="text-gray-600"> (filtered from {jobs.length})</span>
              )}
            </>
          )}
        </span>

        <nav aria-label="Table pagination" className="flex items-center gap-2">
          <PagBtn label="Previous" ariaLabel="Previous page"
            disabled={safePage === 1} onClick={() => setPage((p) => p - 1)} />

          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <span>Page</span>
            <input type="number" min={1} max={totalPages} value={safePage}
              aria-label="Current page"
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 1 && v <= totalPages) setPage(v)
              }}
              className="table-input w-12 px-2 py-1 text-center text-gray-200 text-sm"
            />
            <span>of {totalPages}</span>
          </div>

          <PagBtn label="Next" ariaLabel="Next page"
            disabled={safePage === totalPages} onClick={() => setPage((p) => p + 1)} />
        </nav>
      </div>

      {/* ── Right-click context menu ──────────────────────────────────────── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          job={contextMenu.job}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}
    </div>
  )
}
