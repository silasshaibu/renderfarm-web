'use client'

import {
  useState, useEffect, useCallback, useRef,
  createContext, useContext,
} from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  admin as adminApi, projects as projectsApi,
  payments as paymentsApi, billing as billingApi,
  AdminUser,
} from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'

const CostLimitChart = dynamic(() => import('@/components/CostLimitChart'), { ssr: false })

// ─────────────────────────────────────────────────────────────────────────────
// Toast system
// ─────────────────────────────────────────────────────────────────────────────
type TType = 'success' | 'error'
interface TItem { id: number; msg: string; type: TType }
interface Toaster { success(m: string): void; error(m: string): void }
const ToastCtx = createContext<Toaster>({ success: () => {}, error: () => {} })
const useToast = () => useContext(ToastCtx)

let _tid = 0
function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<TItem[]>([])
  const add = useCallback((msg: string, type: TType) => {
    const id = ++_tid
    setItems(p => [...p, { id, msg, type }])
    setTimeout(() => setItems(p => p.filter(x => x.id !== id)), type === 'error' ? 5000 : 3000)
  }, [])
  const ctx: Toaster = {
    success: useCallback((m) => add(m, 'success'), [add]),
    error:   useCallback((m) => add(m, 'error'),   [add]),
  }
  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      {items.length > 0 && (
        <div className="admin-toast-wrap">
          {items.map(t => (
            <div key={t.id} className={`admin-toast admin-toast--${t.type}`}>{t.msg}</div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────
function SectionBox({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="admin-section-box">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function BlueBtn({ label, onClick, small, disabled }: {
  label: string; onClick?: () => void; small?: boolean; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={['admin-btn-blue', small ? 'sm' : 'md', disabled ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
      {label}
    </button>
  )
}

function GrayBtn({ label, onClick, disabled }: {
  label: string; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={['admin-btn-gray', disabled ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
      {label}
    </button>
  )
}

function Spinner() {
  return <span className="admin-spinner" />
}

function ConfirmModal({ msg, onConfirm, onCancel, confirmLabel = 'Remove', danger = true }: {
  msg: string; onConfirm(): void; onCancel(): void; confirmLabel?: string; danger?: boolean
}) {
  return (
    <div className="enterprise-modal-overlay" onClick={onCancel}>
      <div className="cost-limit-modal-card admin-confirm-card"
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cost-limit-modal-title">
          <span>Confirm</span>
          <button type="button" className="cost-limit-close-btn" onClick={onCancel}>×</button>
        </div>
        <hr className="payment-modal-divider" />
        <p className="admin-confirm-body">{msg}</p>
        <div className="admin-confirm-actions">
          <GrayBtn label="Cancel" onClick={onCancel} />
          <button type="button"
            onClick={onConfirm}
            className={danger ? 'admin-confirm-remove-btn' : 'payment-confirm-btn'}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active')   return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border text-green-400 bg-green-400/10 border-green-400/25">active</span>
  if (status === 'inactive') return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border text-gray-500 bg-gray-500/10 border-gray-500/25">inactive</span>
  if (status === 'pending')  return <span className="admin-badge-pending">pending</span>
  return <span className="text-gray-500 text-xs">{status}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: USERS
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab() {
  const toast = useToast()
  const [require2fa,   setRequire2fa]   = useState(false)
  const [newEmail,     setNewEmail]     = useState('')
  const [newAdmin,     setNewAdmin]     = useState(false)
  const [emailError,   setEmailError]   = useState('')
  const [addingUser,   setAddingUser]   = useState(false)
  const [userFilter,   setUserFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saved2fa,     setSaved2fa]     = useState(false)
  const [saving2fa,    setSaving2fa]    = useState(false)
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null)

  const { data: apiUsers, loading, refetch } = useApiFetch(() => adminApi.users())
  const users: AdminUser[] = (apiUsers as AdminUser[] | null) ?? []

  // Load 2FA setting
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    fetch('/api/wrangler-settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((s: Record<string, unknown> | null) => {
        if (s?.require2fa !== undefined) setRequire2fa(Boolean(s.require2fa))
      })
      .catch(() => null)
  }, [])

  const handle2faSave = async () => {
    setSaving2fa(true)
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    const ok = await fetch('/api/wrangler-settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ require2fa }),
    }).then(r => r.ok).catch(() => false)
    setSaving2fa(false)
    if (ok) { setSaved2fa(true); setTimeout(() => setSaved2fa(false), 2000); toast.success('2FA setting saved.') }
    else toast.error('Failed to save 2FA setting.')
  }

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

  const handleAddUser = async () => {
    setEmailError('')
    if (!newEmail) { setEmailError('Email is required'); return }
    if (!validateEmail(newEmail)) { setEmailError('Invalid email address'); return }
    setAddingUser(true)
    try {
      await adminApi.inviteUser(newEmail, newAdmin)
      toast.success(`Invitation sent to ${newEmail}.`)
      setNewEmail(''); setNewAdmin(false)
      await refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to add user'
      if (msg.includes('already exists')) setEmailError('User already exists')
      else toast.error(msg)
    } finally {
      setAddingUser(false)
    }
  }

  const toggleAdmin = async (u: AdminUser) => {
    try {
      await adminApi.updateUser(u.id, { isAdmin: !u.isAdmin })
      await refetch()
    } catch { toast.error('Failed to update user.') }
  }

  const confirmRemove = async () => {
    if (!removeTarget) return
    try {
      await adminApi.deleteUser(removeTarget.id)
      toast.success(`${removeTarget.email} removed.`)
      await refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove user.')
    } finally {
      setRemoveTarget(null)
    }
  }

  const filtered = users.filter(u => {
    const emailOk  = userFilter ? u.email.toLowerCase().includes(userFilter.toLowerCase()) : true
    const statusOk = statusFilter ? u.status === statusFilter : true
    return emailOk && statusOk
  })

  return (
    <div>
      {removeTarget && (
        <ConfirmModal
          msg={`Are you sure you want to remove ${removeTarget.email} from this account?`}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {/* Account Security Settings */}
      <SectionBox title="Account Security Settings">
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" title="Require 2FA" aria-label="Require 2FA for all users"
            className="mt-0.5 accent-blue-500"
            checked={require2fa} onChange={() => setRequire2fa(v => !v)} />
          <div>
            <span className="text-sm text-gray-200">Require 2FA for all users in this account</span>
            <p className="text-xs text-gray-500 mt-0.5">
              When enabled, all users will be required to set up and use two-factor authentication.
            </p>
          </div>
        </label>
        <button type="button" onClick={handle2faSave} disabled={saving2fa}
          className="admin-btn-blue md">
          {saving2fa ? <><Spinner /> Saving…</> : saved2fa ? '✓ Saved' : 'Save Changes'}
        </button>
      </SectionBox>

      {/* Add Users */}
      <SectionBox title="Add Users">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-xs">
            <input type="email" id="new-user-email" placeholder="Email"
              aria-label="New user email address"
              value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddUser() }}
              className={['calc-input px-3 py-1.5', emailError ? 'border-red-500' : ''].join(' ')} />
            {emailError && <span className="text-xs text-red-400">{emailError}</span>}
          </div>
          <label htmlFor="new-user-admin" className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer mt-1.5">
            <input type="checkbox" id="new-user-admin" title="Grant admin role"
              className="accent-blue-500"
              checked={newAdmin} onChange={() => setNewAdmin(v => !v)} />
            Admin
          </label>
          <BlueBtn label={addingUser ? 'Adding…' : 'Add User'} onClick={handleAddUser} disabled={addingUser} />
        </div>
      </SectionBox>

      {/* Manage Users */}
      <SectionBox title="Manage Users">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div />
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <label htmlFor="user-filter" className="flex items-center gap-1.5">
              Filter:
              <input id="user-filter" type="text" title="Filter by email"
                value={userFilter} onChange={e => setUserFilter(e.target.value)}
                className="calc-input px-2 py-1 w-36 text-sm" />
            </label>
            <label htmlFor="status-filter" className="flex items-center gap-1.5">
              Status:
              <select id="status-filter" title="Filter by status"
                value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="calc-input px-2 py-1 text-sm w-32">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </label>
          </div>
        </div>
        <div className="overflow-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-6"><Spinner /> Loading users…</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="jobs-thead-row">
                  {['EMAIL','STATUS','ADMIN','ACTIONS'].map(h => (
                    <th key={h} className="jobs-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="jobs-td text-center text-gray-600 py-6">No users found.</td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="jobs-tbody-row">
                    <td className="jobs-td font-mono text-xs text-gray-300">{u.email}</td>
                    <td className="jobs-td"><StatusBadge status={u.status} /></td>
                    <td className="jobs-td">
                      <input type="checkbox" title="Admin role" aria-label={`Admin for ${u.email}`}
                        className="accent-blue-500" checked={u.isAdmin}
                        onChange={() => toggleAdmin(u)} />
                    </td>
                    <td className="jobs-td">
                      <button type="button"
                        onClick={() => setRemoveTarget(u)}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </SectionBox>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: COST LIMITS
// ─────────────────────────────────────────────────────────────────────────────
interface CostLimit {
  id: string; entity: string; limitType?: string; startDate: string; endDate: string
  recurring: boolean; action: string; limit: string; spent: number
}

const LIMIT_ACTIONS = ['Hold Pending Tasks', 'Send Email', 'Hold Pending Tasks and Send Email', 'Kill Running Jobs', 'Disable Account']
const LIMIT_TYPES   = ['Job', 'Project', 'Account'] as const
const LIMIT_UNITS   = ['Dollars', 'Core Hours']     as const

function CostLimitsTab() {
  const toast = useToast()
  const { data: apiLimits, loading, refetch } = useApiFetch(() => adminApi.limits())
  const { data: apiProjects }                 = useApiFetch(() => projectsApi.list())
  const limits: CostLimit[]  = (apiLimits   as CostLimit[]  | null) ?? []
  const projList             = (apiProjects  as { id: string; name: string }[] | null) ?? []

  const [filterBy,    setFilterBy]    = useState('')
  const [search,      setSearch]      = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<string | undefined>(undefined)
  const [delConfirm,  setDelConfirm]  = useState<string | null>(null)
  const [updating,    setUpdating]    = useState<string | null>(null)

  // Staged edits
  const [staged, setStaged] = useState<Record<string, Partial<CostLimit>>>({})

  // New limit form
  const [nlType,      setNlType]      = useState<'Job' | 'Project' | 'Account'>('Project')
  const [nlEntity,    setNlEntity]    = useState('')
  const [nlStart,     setNlStart]     = useState('')
  const [nlEnd,       setNlEnd]       = useState('')
  const [nlRecurring, setNlRecurring] = useState(false)
  const [nlAction,    setNlAction]    = useState('Send Email')
  const [nlLimit,     setNlLimit]     = useState('0')
  const [nlUnits,     setNlUnits]     = useState('Dollars')
  const [creating,    setCreating]    = useState(false)

  const entityOptions = [
    { value: 'account', label: 'Account' },
    ...projList.map(p => ({ value: `project ${p.name}`, label: `Project: ${p.name}` })),
  ]

  const displayed = limits.filter(l => {
    const typeOk   = filterBy ? l.entity.toLowerCase().startsWith(filterBy) : true
    const searchOk = search   ? l.entity.toLowerCase().includes(search.toLowerCase()) : true
    return typeOk && searchOk
  })

  const stageChange = (id: string, field: keyof CostLimit, val: string | boolean) => {
    setStaged(s => ({ ...s, [id]: { ...s[id], [field]: val } }))
  }

  const handleUpdate = async (id: string) => {
    const changes = staged[id]
    if (!changes) return
    setUpdating(id)
    try {
      await adminApi.updateLimit(id, changes)
      setStaged(s => { const n = { ...s }; delete n[id]; return n })
      toast.success('Limit updated.')
      await refetch()
    } catch { toast.error('Failed to update limit.') }
    finally { setUpdating(null) }
  }

  const handleDelete = async (id: string) => {
    setDelConfirm(null)
    try {
      await adminApi.deleteLimit(id)
      toast.success('Limit deleted.')
      await refetch()
    } catch { toast.error('Failed to delete limit.') }
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const entity = nlType === 'Account' ? 'account' : nlEntity || `${nlType.toLowerCase()} New`
      await adminApi.createLimit({
        entity, limitType: nlType, limit: nlLimit, units: nlUnits,
        action: nlAction, startDate: nlStart, endDate: nlEnd, recurring: nlRecurring,
      })
      toast.success('Cost limit created.')
      setShowModal(false)
      await refetch()
    } catch { toast.error('Failed to create limit.') }
    finally { setCreating(false) }
  }

  return (
    <div className="admin-panel">
      {delConfirm && (
        <ConfirmModal
          msg="Delete this cost limit? This cannot be undone."
          confirmLabel="Delete" danger
          onConfirm={() => handleDelete(delConfirm)}
          onCancel={() => setDelConfirm(null)}
        />
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="enterprise-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cost-limit-modal-card" onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="cl-modal-title">
            <div className="cost-limit-modal-title">
              <span id="cl-modal-title">Create New Cost Limit</span>
              <button type="button" className="cost-limit-close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <hr className="payment-modal-divider" />
            <div className="flex flex-col gap-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="payment-field-label" htmlFor="nl-type">Type</label>
                  <select id="nl-type" value={nlType}
                    onChange={e => setNlType(e.target.value as typeof nlType)}
                    className="cost-limit-field w-full">
                    {LIMIT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="payment-field-label" htmlFor="nl-entity">Entity</label>
                  {nlType === 'Account' ? (
                    <input id="nl-entity" value="account" readOnly className="cost-limit-field w-full" title="Entity" />
                  ) : nlType === 'Project' ? (
                    <select id="nl-entity" value={nlEntity} onChange={e => setNlEntity(e.target.value)}
                      className="cost-limit-field w-full" title="Select project">
                      <option value="">— Select project —</option>
                      {projList.map(p => <option key={p.id} value={`project ${p.name}`}>{p.name}</option>)}
                    </select>
                  ) : (
                    <input id="nl-entity" value={nlEntity} onChange={e => setNlEntity(e.target.value)}
                      placeholder="Job ID or *" className="cost-limit-field w-full" title="Job ID" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="payment-field-label" htmlFor="nl-start">Start Date</label>
                  <input id="nl-start" type="date" value={nlStart}
                    onChange={e => setNlStart(e.target.value)} className="cost-limit-field w-full" title="Start date" />
                </div>
                <div>
                  <label className="payment-field-label" htmlFor="nl-end">End Date</label>
                  <input id="nl-end" type="date" value={nlEnd}
                    onChange={e => setNlEnd(e.target.value)} className="cost-limit-field w-full" title="End date" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={nlRecurring} onChange={e => setNlRecurring(e.target.checked)}
                  className="accent-blue-500" title="Recurring" />
                Recurring (resets monthly)
              </label>
              <div>
                <label className="payment-field-label" htmlFor="nl-action">Action when limit is hit</label>
                <select id="nl-action" value={nlAction} onChange={e => setNlAction(e.target.value)}
                  className="cost-limit-field w-full" title="Action">
                  {LIMIT_ACTIONS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="payment-field-label" htmlFor="nl-limit">Limit</label>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">{nlUnits === 'Dollars' ? '$' : ''}</span>
                    <input id="nl-limit" type="number" value={nlLimit} min="0"
                      onChange={e => setNlLimit(e.target.value)} className="cost-limit-field flex-1" title="Limit value" />
                  </div>
                </div>
                <div>
                  <label className="payment-field-label" htmlFor="nl-units">Units</label>
                  <select id="nl-units" value={nlUnits} onChange={e => setNlUnits(e.target.value)}
                    className="cost-limit-field w-full" title="Units">
                    {LIMIT_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <hr className="payment-modal-divider" />
            <div className="flex justify-end px-4 py-3 gap-2">
              <GrayBtn label="Cancel" onClick={() => setShowModal(false)} />
              <button type="button" className="cost-limit-create-btn"
                onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart — clicking a row below updates selectedEntity */}
      <CostLimitChart selectedEntity={selectedEntity} />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 mt-4">
        <BlueBtn label="Create New Limit" onClick={() => setShowModal(true)} />
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <label htmlFor="cl-filter" className="flex items-center gap-1.5">
            Filter by:
            <select id="cl-filter" value={filterBy} onChange={e => setFilterBy(e.target.value)}
              className="calc-input px-2 py-1 text-sm w-28" title="Filter by type">
              <option value="">—</option>
              <option value="project">Project</option>
              <option value="account">Account</option>
            </select>
          </label>
          <label htmlFor="cl-search" className="flex items-center gap-1.5">
            Search:
            <input id="cl-search" type="text" placeholder="Search…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="calc-input px-2 py-1 text-sm w-40" title="Search limits" />
          </label>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading…</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['ENTITY','START DATE','END DATE','RECURRING','ACTION','LIMIT','SPENT',''].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={8} className="jobs-td text-center text-gray-600 py-6">No cost limits found.</td></tr>
              ) : displayed.map(l => {
                const s = staged[l.id] ?? {}
                const isSelected = selectedEntity === l.entity
                return (
                  <tr key={l.id}
                    className={['jobs-tbody-row cursor-pointer', isSelected ? 'admin-row-selected' : ''].join(' ')}
                    onClick={() => setSelectedEntity(isSelected ? undefined : l.entity)}>
                    <td className="jobs-td text-gray-300 text-xs">{l.entity}</td>
                    <td className="jobs-td text-gray-500 text-xs font-mono">{l.startDate}</td>
                    <td className="jobs-td" onClick={e => e.stopPropagation()}>
                      <input type="date" title="End date"
                        value={s.endDate ?? l.endDate}
                        onChange={e => stageChange(l.id, 'endDate', e.target.value)}
                        className="calc-input px-2 py-1 text-xs w-32" />
                    </td>
                    <td className="jobs-td text-center" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" title="Recurring" aria-label="Recurring"
                        className="accent-blue-500"
                        checked={s.recurring ?? l.recurring}
                        onChange={e => stageChange(l.id, 'recurring', e.target.checked)} />
                    </td>
                    <td className="jobs-td" onClick={e => e.stopPropagation()}>
                      <select title="Action" value={s.action ?? l.action}
                        onChange={e => stageChange(l.id, 'action', e.target.value)}
                        className="calc-input px-2 py-1 text-xs w-44">
                        {LIMIT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="jobs-td" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500 text-xs">$</span>
                        <input type="number" title="Limit" placeholder="0"
                          value={s.limit ?? l.limit}
                          onChange={e => stageChange(l.id, 'limit', e.target.value)}
                          className="calc-input px-2 py-1 text-xs w-16 text-right" />
                      </div>
                    </td>
                    <td className={['jobs-td text-right font-mono text-xs', l.spent > Number(l.limit) ? 'admin-spent-over' : 'admin-spent-ok'].join(' ')}>
                      ${l.spent.toFixed(2)}
                    </td>
                    <td className="jobs-td" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <button type="button"
                          disabled={!staged[l.id] || updating === l.id}
                          onClick={() => handleUpdate(l.id)}
                          className="px-2 py-1 rounded text-xs text-blue-400 border border-blue-900/40 hover:bg-blue-900/20 transition-colors disabled:opacity-40">
                          {updating === l.id ? <Spinner /> : 'Update'}
                        </button>
                        <button type="button" onClick={() => setDelConfirm(l.id)}
                          className="px-2 py-1 rounded text-xs text-red-400 border border-red-900/40 hover:bg-red-900/20 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: PROJECTS
// ─────────────────────────────────────────────────────────────────────────────
interface ApiProject { id: string; name: string; isActive: boolean; users: number; jobs: number; storageGb: number; createdAt: string }

function ProjectsTab() {
  const toast = useToast()
  const { data: apiProjects, loading, refetch } = useApiFetch(() => projectsApi.list())
  const projects: ApiProject[] = (apiProjects as ApiProject[] | null) ?? []

  const [showForm,  setShowForm]  = useState(false)
  const [newName,   setNewName]   = useState('')
  const [creating,  setCreating]  = useState(false)
  const [formError, setFormError] = useState('')
  const [toggling,  setToggling]  = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) { setFormError('Project name is required'); return }
    setCreating(true); setFormError('')
    try {
      await projectsApi.create(newName.trim())
      toast.success(`Project "${newName.trim()}" created.`)
      setNewName(''); setShowForm(false)
      await refetch()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create project')
    } finally { setCreating(false) }
  }

  const toggleProject = async (p: ApiProject) => {
    setToggling(p.id)
    try {
      await projectsApi.update(p.id, { isActive: !p.isActive })
      toast.success(p.isActive ? `"${p.name}" archived.` : `"${p.name}" restored.`)
      await refetch()
    } catch { toast.error('Failed to update project.') }
    finally { setToggling(null) }
  }

  return (
    <div className="admin-panel">
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Projects</h3>
        <BlueBtn label="+ New Project" small onClick={() => { setShowForm(v => !v); setFormError('') }} />
      </div>

      {showForm && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <input type="text" placeholder="Project name…" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            className="calc-input px-3 py-1.5 flex-1 min-w-[200px] max-w-xs" autoFocus />
          <BlueBtn label={creating ? 'Creating…' : 'Create Project'} onClick={handleCreate} small disabled={creating} />
          <button type="button" className="admin-btn-gray text-xs"
            onClick={() => { setShowForm(false); setNewName(''); setFormError('') }}>
            Cancel
          </button>
          {formError && <span className="text-xs text-red-400">{formError}</span>}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading…</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['PROJECT','USERS','JOBS','STORAGE','CREATED','STATUS',''].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td colSpan={7} className="jobs-td text-center text-gray-600 py-6">No projects found.</td></tr>
              ) : projects.map(p => (
                <tr key={p.id} className="jobs-tbody-row">
                  <td className="jobs-td text-gray-200 font-medium">{p.name}</td>
                  <td className="jobs-td text-right text-gray-400">{p.users}</td>
                  <td className="jobs-td text-right text-gray-400">{p.jobs}</td>
                  <td className="jobs-td text-right font-mono text-gray-400">{(p.storageGb ?? 0).toFixed(1)} GB</td>
                  <td className="jobs-td text-xs font-mono text-gray-500">
                    {new Date(p.createdAt).toLocaleDateString('en-US')}
                  </td>
                  <td className="jobs-td">
                    <span className={[
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                      p.isActive
                        ? 'text-green-400 bg-green-400/10 border-green-400/25'
                        : 'text-gray-500 bg-gray-500/10 border-gray-500/25',
                    ].join(' ')}>
                      {p.isActive ? 'Active' : 'Archived'}
                    </span>
                  </td>
                  <td className="jobs-td">
                    <button type="button"
                      disabled={toggling === p.id}
                      onClick={() => toggleProject(p)}
                      className="text-xs text-gray-500 hover:text-blue-400 transition-colors disabled:opacity-50">
                      {toggling === p.id ? '…' : p.isActive ? 'Archive' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4: SESSIONS
// ─────────────────────────────────────────────────────────────────────────────
interface ApiSession {
  id: string
  user: { email: string }
  ip: string | null
  createdAt: string
  expiresAt: string
}

function SessionsTab() {
  const toast = useToast()
  const { data: apiSessions, loading, refetch, syncing } = useApiFetch(() => adminApi.sessions())
  const sessions: ApiSession[] = (apiSessions as ApiSession[] | null) ?? []
  const [deleting, setDeleting] = useState<string | null>(null)

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => { refetch() }, 30_000)
    return () => clearInterval(id)
  }, [refetch])

  const handleDelete = async (sessionId: string) => {
    setDeleting(sessionId)
    try {
      await adminApi.terminateSession(sessionId)
      await refetch()
    } catch { toast.error('Failed to delete session.') }
    finally { setDeleting(null) }
  }

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <div className="admin-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Active Sessions</h3>
        <div className="flex items-center gap-3">
          {syncing && <span className="text-xs text-gray-500">Refreshing…</span>}
          <GrayBtn label="Refresh" onClick={() => refetch()} />
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading sessions…</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['USER','IP ADDRESS','CREATED','EXPIRES',''].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={5} className="jobs-td text-center text-gray-600 py-6">No active sessions.</td></tr>
              ) : sessions.map(s => (
                <tr key={s.id} className="jobs-tbody-row">
                  <td className="jobs-td font-mono text-xs text-gray-300">{s.user?.email ?? '—'}</td>
                  <td className="jobs-td font-mono text-xs text-gray-400">{s.ip ?? '—'}</td>
                  <td className="jobs-td text-xs text-gray-400">{fmt(s.createdAt)}</td>
                  <td className="jobs-td text-xs text-gray-400">{fmt(s.expiresAt)}</td>
                  <td className="jobs-td">
                    <GrayBtn label={deleting === s.id ? '…' : 'Delete'}
                      disabled={deleting === s.id}
                      onClick={() => handleDelete(s.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-600 mt-3">Auto-refreshes every 30 seconds.</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5: STORAGE
// ─────────────────────────────────────────────────────────────────────────────
function StorageTab() {
  const toast = useToast()
  const { data: storageData, loading: statsLoading } = useApiFetch(() => adminApi.storage())
  const [purgeStatus, setPurgeStatus] = useState<{ inProgress: boolean; initiatedAt: string | null } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [purging,     setPurging]     = useState(false)

  // Load purge status on mount
  useEffect(() => {
    adminApi.purgeStatus()
      .then(s => setPurgeStatus(s))
      .catch(() => null)
  }, [])

  const stats = storageData as { fileCount: number; totalBytes: number; totalGb: number; totalMb: number } | null

  const handlePurge = async () => {
    setShowConfirm(false)
    setPurging(true)
    try {
      await adminApi.purgeStorage()
      setPurgeStatus({ inProgress: true, initiatedAt: new Date().toISOString() })
      toast.success('Storage purge initiated. This may take up to 24 hours.')
    } catch { toast.error('Failed to initiate storage purge.') }
    finally { setPurging(false) }
  }

  const fmtBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(2)} MB`
    return `${(bytes / (1024 ** 3)).toFixed(3)} GB`
  }

  return (
    <div className="admin-panel">
      {showConfirm && (
        <ConfirmModal
          msg={'This will permanently delete all uploaded and output files. This action cannot be undone and may take up to 24 hours to complete.\n\nAre you sure you want to proceed?'}
          confirmLabel="Confirm Purge"
          danger
          onConfirm={handlePurge}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Storage stats */}
      {statsLoading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-5"><Spinner /> Loading storage stats…</div>
      ) : stats ? (
        <div className="admin-storage-stats mb-5">
          <div className="admin-storage-stat-item">
            <span className="admin-storage-stat-label">Files</span>
            <span className="admin-storage-stat-value">{stats.fileCount.toLocaleString()}</span>
          </div>
          <div className="admin-storage-stat-item">
            <span className="admin-storage-stat-label">Uploaded files</span>
            <span className="admin-storage-stat-value">{fmtBytes(stats.totalBytes)}</span>
          </div>
          <div className="admin-storage-stat-item">
            <span className="admin-storage-stat-label">Total</span>
            <span className="admin-storage-stat-value">{stats.totalGb.toFixed(3)} GB</span>
          </div>
        </div>
      ) : null}

      <h3 className="text-sm font-semibold text-gray-200 mb-4">Storage Purge</h3>
      <p className="text-sm text-gray-300 mb-5">
        Purging your account&apos;s storage will halt further storage costs. However, please be
        careful as this operation is <span className="text-red-400 font-semibold">irreversible.</span>
      </p>
      <div className="mb-5">
        <p className="text-sm font-semibold text-gray-300 mb-2">Targeted Data</p>
        <ul className="list-disc list-inside text-sm text-gray-400 space-y-1 ml-1">
          <li>uploaded files</li>
          <li>output files (rendered images, generated caches, etc.)</li>
        </ul>
      </div>
      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-300 mb-2">Considerations</p>
        <ul className="list-disc list-inside text-sm text-gray-400 space-y-2 ml-1">
          <li>Be sure to download any rendered output data that has not yet been downloaded.</li>
          <li>Consider whether future jobs may require any of these files (which could be burdensome to re-upload).</li>
          <li>
            The purging process may take up to 24 hours to complete, so{' '}
            <span className="text-red-400">
              only proceed if you do not plan on running subsequent work in that time frame.
            </span>
          </li>
        </ul>
      </div>

      {purgeStatus?.inProgress ? (
        <div className="admin-alert-warn">
          ⏳ Storage purge initiated
          {purgeStatus.initiatedAt ? ` on ${new Date(purgeStatus.initiatedAt).toLocaleString()}` : ''} — this may take up to 24 hours.
        </div>
      ) : (
        <button type="button"
          disabled={purging}
          className="admin-purge-btn"
          onClick={() => setShowConfirm(true)}>
          {purging ? 'Initiating purge…' : 'Purge'}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6: PAYMENT INFORMATION
// ─────────────────────────────────────────────────────────────────────────────
const PREPAY_OPTIONS = [
  { value: '100',  label: '$100',  bonus: null    },
  { value: '500',  label: '$500',  bonus: '+$50'  },
  { value: '1000', label: '$1000', bonus: '+$150' },
]

function PaymentTab() {
  const toast = useToast()
  const [prepay,      setPrepay]      = useState('100')
  const [showEntries, setShowEntries] = useState(10)
  const [selected,    setSelected]    = useState<Set<number>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [purchasing,  setPurchasing]  = useState(false)

  // Add Card form
  const [cardNum,  setCardNum]  = useState('')
  const [expiry,   setExpiry]   = useState('')
  const [cvv,      setCvv]      = useState('')
  const [postal,   setPostal]   = useState('')

  const { data: txData,   refetch: refetchTx }    = useApiFetch(() => paymentsApi.transactions())
  const { data: cardData, refetch: refetchCards }  = useApiFetch(() => paymentsApi.cards())
  const { data: period }                           = useApiFetch(() => paymentsApi.period())

  type ApiTx   = import('@/lib/api').ApiTransaction
  type ApiCard = { id: string; brand: string; number: string; exp: string; isDefault: boolean }

  const transactions: ApiTx[]   = (txData   as ApiTx[]   | null) ?? []
  const cards:        ApiCard[] = (cardData  as ApiCard[] | null) ?? []

  const removeCard = async (id: string) => {
    try {
      await paymentsApi.removeCard(id)
      toast.success('Card removed.')
      await refetchCards()
    } catch { toast.error('Failed to remove card.') }
  }

  const totalPages = Math.ceil(transactions.length / showEntries)
  const [page, setPage] = useState(1)
  const pageTx = transactions.slice((page - 1) * showEntries, page * showEntries)

  const toggleRow = (i: number) =>
    setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const allSelected = pageTx.length > 0 && pageTx.every((_, i) => selected.has((page - 1) * showEntries + i))
  const toggleAll = () => {
    setSelected(s => {
      const n = new Set(s)
      if (allSelected) pageTx.forEach((_, i) => n.delete((page - 1) * showEntries + i))
      else             pageTx.forEach((_, i) => n.add((page - 1) * showEntries + i))
      return n
    })
  }

  const selectedOpt = PREPAY_OPTIONS.find(o => o.value === prepay)!
  const defaultCard = cards.find(c => c.isDefault) ?? cards[0]

  const handlePrepay = async () => {
    setShowConfirm(false)
    if (!defaultCard) { toast.error('Please add a credit card before purchasing.'); return }
    setPurchasing(true)
    try {
      await billingApi.prepay(Number(prepay))
      toast.success(`$${prepay} prepay successful!${selectedOpt.bonus ? ` ${selectedOpt.bonus} bonus credit added.` : ''}`)
      await refetchTx()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Prepay failed.')
    } finally { setPurchasing(false) }
  }

  const handlePurchaseClick = () => {
    if (!defaultCard) { toast.error('Please add a credit card before purchasing.'); return }
    setShowConfirm(true)
  }

  const txStatusColor = (s: string) => {
    if (s === 'settled')            return 'text-green-400'
    if (s === 'pending')            return 'text-amber-400'
    if (s === 'refunded')           return 'text-blue-400'
    if (s === 'processor_declined') return 'text-red-400'
    return 'text-gray-400'
  }

  // Receipt printer
  const handlePrint = () => {
    const rows = selected.size > 0
      ? transactions.filter((_, i) => selected.has(i))
      : pageTx
    const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>Renderfarm Receipt</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 32px 40px; }
.hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
h1 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
.logo { font-size: 20px; font-weight: 900; border: 2px solid #111; padding: 4px 10px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { background: #f0f0f0; font-size: 10px; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #ddd; }
td { font-size: 10px; padding: 4px 6px; border: 1px solid #ddd; }
.tr { text-align: right; }
</style></head><body>
<div class="hdr">
  <div><h1>Renderfarm Platform</h1><p>invoice@renderfarm.swade-art.com</p></div>
  <div><div class="logo">RENDERFARM</div><p style="text-align:right;font-size:11px">Date: ${today}</p></div>
</div>
<table><thead><tr>
  <th>Date</th><th>Description</th><th>Card</th><th>Type</th><th>Status</th>
  <th>Auth Code</th><th class="tr">Bonus</th><th class="tr">Amount</th>
</tr></thead><tbody>
${rows.map(t => `<tr>
  <td>${new Date(t.date).toLocaleString()}</td>
  <td>${t.description}</td><td>${t.cardNumber}</td><td>${t.type}</td><td>${t.status}</td>
  <td>${t.authCode ?? '—'}</td>
  <td class="tr">$${(t.bonusCredit ?? 0).toFixed(2)}</td>
  <td class="tr">$${(t.amount ?? 0).toFixed(2)}</td>
</tr>`).join('')}
</tbody></table>
</body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  return (
    <div className="admin-panel flex flex-col gap-5">

      {/* Confirm Payment Modal */}
      {showConfirm && (
        <div className="enterprise-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="payment-modal-card" onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" className="payment-modal-title">Confirm Payment</h2>
            <hr className="payment-modal-divider" />
            <p className="text-sm text-gray-300 px-5 py-4">
              Your card will be charged{' '}
              <strong className="text-white">${selectedOpt.value}</strong> for{' '}
              <strong className="text-white">${selectedOpt.value}</strong> of credit.
              {selectedOpt.bonus && <> <span className="text-green-400">{selectedOpt.bonus} bonus credit</span> will also be applied.</>}
            </p>
            <hr className="payment-modal-divider" />
            {defaultCard && (
              <div className="flex items-center gap-6 px-5 py-3 text-sm text-gray-400">
                <span>Card <span className="text-gray-200 ml-1">{defaultCard.brand} ending in {defaultCard.number.slice(-4)}</span></span>
                <span>Expiry <span className="text-gray-200 ml-1">{defaultCard.exp}</span></span>
              </div>
            )}
            <hr className="payment-modal-divider" />
            <div className="flex items-center gap-3 px-5 py-4 justify-end">
              <button type="button" className="payment-confirm-btn" disabled={purchasing}
                onClick={handlePrepay}>
                {purchasing ? 'Processing…' : 'Confirm'}
              </button>
              <button type="button" className="payment-cancel-btn" onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Card Modal */}
      {showAddCard && (
        <div className="enterprise-modal-overlay" onClick={() => setShowAddCard(false)}>
          <div className="payment-modal-card" onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="addcard-title">
            <h2 id="addcard-title" className="payment-modal-title">Add Credit Card</h2>
            <hr className="payment-modal-divider" />
            <div className="flex flex-col gap-4 px-5 py-5">
              {[
                { id: 'cc-number', label: 'Card Number', ph: '4111 1111 1111 1111', val: cardNum, set: setCardNum, max: 19 },
                { id: 'cc-expiry', label: 'Expiration Date', ph: 'MM/YY', val: expiry, set: setExpiry, max: 5 },
                { id: 'cc-cvv',    label: 'CVV', ph: '123', val: cvv, set: setCvv, max: 4 },
                { id: 'cc-postal', label: 'Postal or Country Code', ph: '11111', val: postal, set: setPostal, max: 10 },
              ].map(f => (
                <div key={f.id}>
                  <label className="payment-field-label" htmlFor={f.id}>{f.label}</label>
                  <input id={f.id} type="text" placeholder={f.ph} maxLength={f.max}
                    value={f.val} onChange={e => f.set(e.target.value)}
                    className="payment-field-input" />
                </div>
              ))}
            </div>
            <hr className="payment-modal-divider" />
            <div className="flex items-center gap-3 px-5 py-4 justify-end">
              <button type="button" className="payment-confirm-btn" onClick={async () => {
                if (cardNum) {
                  try {
                    await paymentsApi.addCard({ brand: 'Card', number: cardNum, exp: expiry })
                    toast.success('Card added.')
                    await refetchCards()
                    setCardNum(''); setExpiry(''); setCvv(''); setPostal('')
                  } catch { toast.error('Failed to add card.') }
                }
                setShowAddCard(false)
              }}>Ok</button>
              <button type="button" className="payment-cancel-btn" onClick={() => setShowAddCard(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && (
        <div className="enterprise-modal-overlay" onClick={() => setShowReceipt(false)}>
          <div className="receipt-modal-card" onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-labelledby="receipt-title">
            <div className="receipt-modal-header">
              <div>
                <h2 id="receipt-title" className="receipt-modal-company">Renderfarm Platform</h2>
                <p className="receipt-modal-address">invoice@renderfarm.swade-art.com</p>
              </div>
              <div className="receipt-modal-right">
                <div className="receipt-modal-logo">RENDERFARM</div>
                <div className="receipt-modal-meta">
                  <div><span className="receipt-modal-meta-label">Date</span>
                    {new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
            </div>
            <div className="receipt-modal-table-wrap">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="receipt-thead-row">
                    {['Transaction Date','Description','Card Number','Type','Status','Bonus Credit','Amount'].map(h => (
                      <th key={h} className="receipt-th">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(selected.size > 0 ? transactions.filter((_, i) => selected.has(i)) : pageTx).map((t, i) => (
                    <tr key={i} className="receipt-tbody-row">
                      <td className="receipt-td font-mono">{new Date(t.date).toLocaleString()}</td>
                      <td className="receipt-td">{t.description}</td>
                      <td className="receipt-td font-mono">{t.cardNumber}</td>
                      <td className="receipt-td">{t.type}</td>
                      <td className="receipt-td">
                        <span className={txStatusColor(t.status)}>{t.status}</span>
                      </td>
                      <td className="receipt-td text-right">${(t.bonusCredit ?? 0).toFixed(2)}</td>
                      <td className="receipt-td text-right font-semibold">${(t.amount ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="receipt-modal-actions">
              <button type="button" className="payment-confirm-btn" onClick={handlePrint}>Print</button>
              <button type="button" className="payment-cancel-btn" onClick={() => setShowReceipt(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Current Billing Period */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Current Billing Period</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['START DATE','END DATE','CARRY OVER','AMOUNT SPENT','AMOUNT CHARGED','ADDITIONAL CREDITS','OUTSTANDING BALANCE'].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="jobs-tbody-row">
                {[
                  period?.startDate ? new Date(period.startDate).toLocaleDateString('en-US') : '—',
                  period?.endDate   ? new Date(period.endDate).toLocaleDateString('en-US')   : '—',
                  (period?.carryOver     ?? 0).toFixed(2),
                  (period?.amountSpent   ?? 0).toFixed(2),
                  (period?.amountCharged ?? 0).toFixed(2),
                  '0.00',
                  (period?.outstandingBalance ?? 0).toFixed(2),
                ].map((v, i) => (
                  <td key={i} className="jobs-td font-mono text-xs text-gray-300 text-right first:text-left">{v}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Prepay Options */}
      <div className="admin-payment-section">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Prepay Options</h3>
        <p className="text-xs text-gray-500 mb-3">
          Payments are charged immediately.{' '}
          <span className="text-blue-400">Bonus</span> values will appear as credit in your account.
        </p>
        {PREPAY_OPTIONS.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-1.5">
            <input type="radio" name="prepay" title={`Prepay ${opt.label}`}
              className="accent-blue-500" checked={prepay === opt.value}
              onChange={() => setPrepay(opt.value)} />
            {opt.label}
            {opt.bonus && <span className="text-green-400 text-xs font-semibold">{opt.bonus}</span>}
          </label>
        ))}
        <div className="mt-3">
          <GrayBtn label={purchasing ? 'Processing…' : 'Purchase'} onClick={handlePurchaseClick} disabled={purchasing} />
        </div>
      </div>

      {/* Credit Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Credit Cards</h3>
        {cards.length === 0 && (
          <p className="text-xs text-gray-500 mb-3">No cards on file. Add one to enable purchasing.</p>
        )}
        {cards.map(card => (
          <div key={card.id} className="admin-card-row group">
            <div className="admin-card-chip">{card.brand}</div>
            <span className="text-sm text-gray-300 flex-1">{card.number}</span>
            <span className="text-xs text-gray-500">Exp {card.exp}</span>
            {card.isDefault && <span className="text-xs text-gray-400 italic">default</span>}
            <button type="button" onClick={() => removeCard(card.id)}
              aria-label={`Remove card ending in ${card.number.slice(-4)}`}
              className="admin-card-delete-btn">×</button>
          </div>
        ))}
        <GrayBtn label="Add Card" onClick={() => setShowAddCard(true)} />
      </div>

      {/* Payment History */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Payment History</h3>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <GrayBtn label="Print Receipt" onClick={() => setShowReceipt(true)} />
          <p className="text-xs text-gray-500">
            <span className="text-blue-400">Tip:</span> Select rows to print only those transactions
          </p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                <th className="jobs-th w-8">
                  <input type="checkbox" title="Select all" aria-label="Select all"
                    className="accent-blue-500"
                    checked={allSelected}
                    onChange={toggleAll} />
                </th>
                {['TRANSACTION DATE','CARD NUMBER','TYPE','STATUS','BONUS CREDIT','AMOUNT'].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={7} className="jobs-td text-center text-gray-600 py-6">No transactions found.</td></tr>
              ) : pageTx.map((t, localIdx) => {
                const globalIdx = (page - 1) * showEntries + localIdx
                const isSelected = selected.has(globalIdx)
                return (
                  <tr key={t.id}
                    className={['jobs-tbody-row cursor-pointer', isSelected ? 'admin-row-selected' : ''].join(' ')}
                    onClick={() => toggleRow(globalIdx)}>
                    <td className="jobs-td text-center">
                      <input type="checkbox" title="Select row" aria-label={`Select row ${globalIdx + 1}`}
                        className="accent-blue-500" checked={isSelected}
                        onChange={() => toggleRow(globalIdx)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td className="jobs-td text-xs font-mono text-gray-400">
                      {new Date(t.date).toLocaleString()}
                    </td>
                    <td className="jobs-td text-xs font-mono text-gray-400">{t.cardNumber}</td>
                    <td className="jobs-td text-xs text-gray-400">{t.type}</td>
                    <td className="jobs-td text-xs">
                      <span className={txStatusColor(t.status)}>{t.status}</span>
                    </td>
                    <td className="jobs-td text-right font-mono text-xs text-gray-400">${(t.bonusCredit ?? 0).toFixed(2)}</td>
                    <td className="jobs-td text-right font-mono text-xs text-gray-300">${(t.amount ?? 0).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            Show
            <select title="Show N entries" value={showEntries}
              onChange={e => { setShowEntries(Number(e.target.value)); setPage(1) }}
              className="calc-input px-2 py-1 text-xs w-14">
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            entries
          </div>
          <div className="flex items-center gap-2">
            <span>Showing {transactions.length === 0 ? 0 : (page - 1) * showEntries + 1} to {Math.min(page * showEntries, transactions.length)} of {transactions.length} entries</span>
            {totalPages > 1 && (
              <div className="flex gap-1">
                <button type="button" disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-2 py-0.5 rounded text-xs border border-gray-700 disabled:opacity-40 hover:bg-gray-800">
                  ‹
                </button>
                <button type="button" disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2 py-0.5 rounded text-xs border border-gray-700 disabled:opacity-40 hover:bg-gray-800">
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab config + Page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'users',    label: 'Users',               Panel: UsersTab      },
  { id: 'limits',   label: 'Cost Limits',         Panel: CostLimitsTab },
  { id: 'projects', label: 'Projects',            Panel: ProjectsTab   },
  { id: 'sessions', label: 'Sessions',            Panel: SessionsTab   },
  { id: 'storage',  label: 'Storage',             Panel: StorageTab    },
  { id: 'payment',  label: 'Payment Information', Panel: PaymentTab    },
] as const
type TabId = (typeof TABS)[number]['id']

export default function AdminPage() {
  const router = useRouter()
  const [active,       setActive]       = useState<TabId>('users')
  const [authChecked,  setAuthChecked]  = useState(false)

  // Admin guard — decode JWT client-side
  useEffect(() => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('rf_token')
    if (!token) { router.replace('/'); return }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (!payload.isAdmin) { router.replace('/jobs'); return }
    } catch {
      router.replace('/')
      return
    }
    setAuthChecked(true)
  }, [router])

  // Tab persistence — read from URL on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const t = p.get('tab') as TabId | null
    if (t && TABS.some(x => x.id === t)) setActive(t)
  }, [])

  const changeTab = (id: TabId) => {
    setActive(id)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', id)
      window.history.pushState({}, '', url.toString())
    }
  }

  if (!authChecked) return null

  const { Panel } = TABS.find(t => t.id === active)!

  return (
    <ToastHost>
      <div className="flex flex-col gap-4">
        <div><h1 className="text-2xl font-semibold text-white tracking-tight">Admin</h1></div>
        <div className="admin-tabbar">
          {TABS.map(tab => (
            <button key={tab.id} type="button" onClick={() => changeTab(tab.id)}
              className={['admin-tab', active === tab.id ? 'admin-tab--active' : ''].join(' ')}>
              {tab.label}
            </button>
          ))}
        </div>
        <Panel />
      </div>
    </ToastHost>
  )
}
