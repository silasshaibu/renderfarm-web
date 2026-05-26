'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { admin as adminApi, projects as projectsApi, payments as paymentsApi } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'

const CostLimitChart = dynamic(() => import('@/components/CostLimitChart'), { ssr: false })

// ---------------------------------------------------------------------------
// Shared micro-components (no inline styles)
// ---------------------------------------------------------------------------
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

function BlueBtn({ label, onClick, small }: { label: string; onClick?: () => void; small?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={['admin-btn-blue', small ? 'sm' : 'md'].join(' ')}>
      {label}
    </button>
  )
}

function GrayBtn({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="admin-btn-gray">
      {label}
    </button>
  )
}

function SaveChangesBtn({ onClick }: { onClick?: () => void }) {
  return <BlueBtn label="Save Changes" onClick={onClick} />
}

function SuccessAlert({ msg }: { msg: string }) {
  return <div className="admin-alert-success">✓ {msg}</div>
}

// ---------------------------------------------------------------------------
// 1. USERS TAB
// ---------------------------------------------------------------------------
interface ManagedUser { id: string; email: string; name: string; isActive: boolean; isAdmin: boolean }

function UsersTab() {
  const [require2fa,   setRequire2fa]   = useState(false)
  const [newEmail,     setNewEmail]     = useState('')
  const [newAdmin,     setNewAdmin]     = useState(false)
  const [userFilter,   setUserFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [saved,        setSaved]        = useState(false)

  const { data: apiUsers, refetch } = useApiFetch(() => adminApi.users())
  const users: ManagedUser[] = (apiUsers as ManagedUser[] | null) ?? []

  // Load + persist the require2fa setting via wrangler-settings
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    fetch('/api/wrangler-settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((s: Record<string, unknown> | null) => {
        if (s?.require2fa !== undefined) setRequire2fa(Boolean(s.require2fa))
      })
      .catch(() => null)
  }, [])

  const handleSave = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    await fetch('/api/wrangler-settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ require2fa }),
    }).catch(() => null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAddUser = async () => {
    if (!newEmail) return
    try {
      const firstName = newEmail.split('@')[0]
      const token     = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName:    '',
          email:       newEmail,
          password:    'TempPass1!',
          accountName: firstName,
          isAdmin:     newAdmin,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to create user' }))
        alert(err.message ?? 'Failed to create user')
        return
      }
      await refetch()
    } catch { /* ignore */ }
    setNewEmail('')
    setNewAdmin(false)
  }

  const toggleUser = async (id: string, field: 'isActive' | 'isAdmin', val: boolean) => {
    await adminApi.updateUser(id, { [field]: val })
    await refetch()
  }

  const removeUser = async (id: string) => {
    // Soft-deactivate
    await adminApi.updateUser(id, { isActive: false })
    await refetch()
  }

  const filteredUsers = users.filter((u) => {
    const emailOk  = userFilter ? u.email.toLowerCase().includes(userFilter.toLowerCase()) : true
    const statusOk = statusFilter === 'active' ? u.isActive : statusFilter === 'inactive' ? !u.isActive : true
    return emailOk && statusOk
  })

  return (
    <div>
      {saved && <SuccessAlert msg="Changes saved" />}

      {/* Account Security Settings */}
      <SectionBox title="Account Security Settings">
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" title="Require 2FA" aria-label="Require 2FA for all users"
            className="mt-0.5 accent-blue-500"
            checked={require2fa} onChange={() => setRequire2fa((v) => !v)} />
          <div>
            <span className="text-sm text-gray-200">Require 2FA for all users in this account</span>
            <p className="text-xs text-gray-500 mt-0.5">
              When enabled, all users will be required to set up and use two-factor authentication.
            </p>
          </div>
        </label>
        <SaveChangesBtn onClick={handleSave} />
      </SectionBox>

      {/* Add Users */}
      <SectionBox title="Add Users">
        <div className="flex items-center gap-3 flex-wrap">
          <input type="email" id="new-user-email" placeholder="Email"
            aria-label="New user email address"
            value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            className="calc-input px-3 py-1.5 flex-1 min-w-[200px] max-w-xs" />
          <label htmlFor="new-user-admin" className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" id="new-user-admin" title="Grant admin role"
              className="accent-blue-500"
              checked={newAdmin} onChange={() => setNewAdmin((v) => !v)} />
            Admin
          </label>
          <BlueBtn label="Add User" onClick={handleAddUser} />
        </div>
      </SectionBox>

      {/* Manage Users */}
      <SectionBox title="Manage Users">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <SaveChangesBtn onClick={handleSave} />
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <label htmlFor="user-filter" className="flex items-center gap-1.5">
              User Filter:
              <input id="user-filter" type="text" title="Filter by email"
                value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
                className="calc-input px-2 py-1 w-36 text-sm" />
            </label>
            <label htmlFor="status-filter" className="flex items-center gap-1.5">
              Status Filter:
              <select id="status-filter" title="Filter by status"
                value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="calc-input px-2 py-1 text-sm w-32">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['EMAIL','STATUS','ADMIN','ACTIONS'].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={4} className="jobs-td text-center text-gray-600">No users found.</td></tr>
              ) : filteredUsers.map((u) => (
                <tr key={u.email} className="jobs-tbody-row">
                  <td className="jobs-td font-mono text-xs text-gray-300">{u.email}</td>
                  <td className="jobs-td">
                    <span className={[
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                      u.isActive
                        ? 'text-green-400 bg-green-400/10 border-green-400/25'
                        : 'text-gray-500 bg-gray-500/10 border-gray-500/25',
                    ].join(' ')}>
                      {u.isActive ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="jobs-td">
                    <input type="checkbox" title="Admin role" aria-label={`Admin for ${u.email}`}
                      className="accent-blue-500" checked={u.isAdmin}
                      onChange={() => toggleUser(u.id, 'isAdmin', !u.isAdmin)} />
                  </td>
                  <td className="jobs-td">
                    <button type="button"
                      onClick={() => removeUser(u.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionBox>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. COST LIMITS TAB
// ---------------------------------------------------------------------------
interface CostLimit {
  id: string; entity: string; startDate: string; endDate: string
  recurring: boolean; action: string; limit: string; spent: number
}

const LIMIT_ACTIONS = ['Hold Pending Tasks', 'Send Email', 'Kill Running Jobs', 'Disable Account']

const INITIAL_LIMITS: CostLimit[] = [
  { id: 'l1', entity: 'project Paper',                   startDate: '07/18/2025', endDate: '07/30/2025', recurring: false, action: 'Hold Pending Tasks', limit: '5', spent: 9.30 },
  { id: 'l2', entity: 'project InoScene2-ConductorTech',  startDate: '07/18/2025', endDate: '07/31/2025', recurring: false, action: 'Hold Pending Tasks', limit: '5', spent: 0    },
  { id: 'l3', entity: 'project ConductorRenderTest',      startDate: '07/18/2025', endDate: '07/31/2025', recurring: false, action: 'Send Email',          limit: '5', spent: 0    },
]

const LIMIT_TYPES = ['Job', 'Project', 'Account'] as const
const LIMIT_UNITS = ['Dollars', 'Core Hours'] as const

function CostLimitsTab() {
  const { data: apiLimits, refetch: refetchLimits } = useApiFetch(() => adminApi.limits())
  const limits: CostLimit[] = (apiLimits as CostLimit[] | null) ?? []

  const [filterBy,    setFilterBy]    = useState('')
  const [search,      setSearch]      = useState('')
  const [showModal,   setShowModal]   = useState(false)

  // New limit form state
  const [nlType,      setNlType]      = useState('Job')
  const [nlJobId,     setNlJobId]     = useState('')
  const [nlStart,     setNlStart]     = useState(new Date().toLocaleDateString('en-US'))
  const [nlEnd,       setNlEnd]       = useState('')
  const [nlRecurring, setNlRecurring] = useState(false)
  const [nlAction,    setNlAction]    = useState('Send Email')
  const [nlLimit,     setNlLimit]     = useState('0')
  const [nlUnits,     setNlUnits]     = useState('Dollars')

  const displayed = limits.filter((l) =>
    search ? l.entity.toLowerCase().includes(search.toLowerCase()) : true
  )

  const handleCreate = async () => {
    await adminApi.createLimit({
      entity:    nlJobId ? `${nlType.toLowerCase()} ${nlJobId}` : `${nlType.toLowerCase()} New`,
      limitType: nlType,
      limit:     nlLimit,
      units:     nlUnits,
      action:    nlAction,
      startDate: nlStart,
      endDate:   nlEnd,
      recurring: nlRecurring,
    })
    await refetchLimits()
    setShowModal(false)
  }

  const updateLimit = async (id: string, field: keyof CostLimit, value: string | boolean) => {
    await adminApi.updateLimit(id, { [field]: value }).catch(() => null)
    await refetchLimits()
  }

  const deleteLimit = async (id: string) => {
    await adminApi.deleteLimit(id)
    await refetchLimits()
  }

  return (
    <div className="admin-panel">

      {/* ── Create New Cost Limit Modal ───────────────────────────────── */}
      {showModal && (
        <div className="enterprise-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="cost-limit-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cl-modal-title">
            <div className="cost-limit-modal-title">
              <span id="cl-modal-title">Create New Cost Limit</span>
              <button type="button" className="cost-limit-close-btn" onClick={() => setShowModal(false)} aria-label="Close">×</button>
            </div>
            <hr className="payment-modal-divider" />

            {/* Column headers */}
            <div className="grid grid-cols-8 gap-2 px-4 pt-3">
              {[
                ['Type', true], ['Job ID', false], ['—', false],
                ['Start Date', true], ['End Date', true], ['Recurring', true],
                ['Action', true], ['Limit', false], ['Units', false],
              ].map(([label, blue]) => (
                <div key={String(label)} className={`cost-limit-col-header ${blue ? '' : 'cost-limit-col-header--plain'}`}>
                  {label}
                </div>
              ))}
            </div>

            {/* Input row */}
            <div className="grid grid-cols-8 gap-2 px-4 pb-4 pt-1 items-center">
              <select title="Type" value={nlType} onChange={(e) => setNlType(e.target.value)} className="cost-limit-field">
                {LIMIT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input type="text" placeholder="Job ID or *a" value={nlJobId}
                onChange={(e) => setNlJobId(e.target.value)} className="cost-limit-field" title="Job ID" />
              <input type="text" placeholder="—" className="cost-limit-field" title="Entity filter" readOnly />
              <input type="date" value={nlStart} onChange={(e) => setNlStart(e.target.value)}
                className="cost-limit-field" title="Start date" />
              <input type="date" value={nlEnd} onChange={(e) => setNlEnd(e.target.value)}
                className="cost-limit-field" title="End date" />
              <div className="flex justify-center">
                <input type="checkbox" title="Recurring" checked={nlRecurring}
                  onChange={(e) => setNlRecurring(e.target.checked)} className="accent-blue-500 w-4 h-4" />
              </div>
              <select title="Action" value={nlAction} onChange={(e) => setNlAction(e.target.value)} className="cost-limit-field">
                {LIMIT_ACTIONS.map((a) => <option key={a}>{a}</option>)}
              </select>
              <input type="number" value={nlLimit} onChange={(e) => setNlLimit(e.target.value)}
                className="cost-limit-field" title="Limit" min="0" />
              <select title="Units" value={nlUnits} onChange={(e) => setNlUnits(e.target.value)} className="cost-limit-field">
                {LIMIT_UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>

            <hr className="payment-modal-divider" />
            <div className="flex justify-end px-4 py-3">
              <button type="button" className="cost-limit-create-btn" onClick={handleCreate}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <CostLimitChart />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2 mt-4">
        <BlueBtn label="Create New Limit" onClick={() => setShowModal(true)} />
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <label htmlFor="cl-filter" className="flex items-center gap-1.5">
            Filter by:
            <select id="cl-filter" title="Filter by entity type" value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="calc-input px-2 py-1 text-sm w-24">
              <option value="">—</option>
              <option value="project">Project</option>
              <option value="user">User</option>
            </select>
          </label>
          <label htmlFor="cl-search" className="flex items-center gap-1.5">
            Search:
            <input id="cl-search" type="text" title="Search cost limits" placeholder="Search…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="calc-input px-2 py-1 text-sm w-40" />
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {['ENTITY','START DATE','END DATE','RECURRING','ACTION','LIMIT','SPENT',''].map((h) => (
                <th key={h} className="jobs-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((l) => (
              <tr key={l.id} className="jobs-tbody-row">
                <td className="jobs-td text-gray-300 text-xs">{l.entity}</td>
                <td className="jobs-td text-gray-500 text-xs font-mono">{l.startDate}</td>
                <td className="jobs-td">
                  <input type="text" title="End date" placeholder="MM/DD/YYYY"
                    value={l.endDate} onChange={(e) => updateLimit(l.id, 'endDate', e.target.value)}
                    className="calc-input px-2 py-1 text-xs w-28" />
                </td>
                <td className="jobs-td text-center">
                  <input type="checkbox" title="Recurring limit" aria-label="Recurring"
                    className="accent-blue-500" checked={l.recurring}
                    onChange={() => updateLimit(l.id, 'recurring', !l.recurring)} />
                </td>
                <td className="jobs-td">
                  <select title="Action when limit is reached"
                    value={l.action} onChange={(e) => updateLimit(l.id, 'action', e.target.value)}
                    className="calc-input px-2 py-1 text-xs w-40">
                    {LIMIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
                <td className="jobs-td">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-xs">$</span>
                    <input type="number" title="Cost limit in USD" placeholder="0"
                      value={l.limit} onChange={(e) => updateLimit(l.id, 'limit', e.target.value)}
                      className="calc-input px-2 py-1 text-xs w-16 text-right" />
                  </div>
                </td>
                <td className={['jobs-td text-right font-mono text-xs', l.spent > Number(l.limit) ? 'admin-spent-over' : 'admin-spent-ok'].join(' ')}>
                  ${l.spent.toFixed(2)}
                </td>
                <td className="jobs-td">
                  <div className="flex gap-1.5">
                    <GrayBtn label="Update" />
                    <button type="button" onClick={() => deleteLimit(l.id)}
                      className="px-2 py-1 rounded text-xs text-red-400 border border-red-900/40 hover:bg-red-900/20 transition-colors">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. PROJECTS TAB
// ---------------------------------------------------------------------------
interface ApiProject { id: string; name: string; isActive: boolean; users: number; jobs: number; storageGb: number; createdAt: string }

function ProjectsTab() {
  const { data: apiProjects, refetch } = useApiFetch(() => projectsApi.list())
  const projects: ApiProject[] = (apiProjects as ApiProject[] | null) ?? []

  const [showForm,    setShowForm]    = useState(false)
  const [newName,     setNewName]     = useState('')
  const [creating,    setCreating]    = useState(false)
  const [formError,   setFormError]   = useState('')

  const toggleProject = async (p: ApiProject) => {
    await projectsApi.update(p.id, { isActive: !p.isActive })
    await refetch()
  }

  const handleCreate = async () => {
    if (!newName.trim()) { setFormError('Project name is required'); return }
    setCreating(true); setFormError('')
    try {
      await projectsApi.create(newName.trim())
      setNewName(''); setShowForm(false)
      await refetch()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create project')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="admin-panel">
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Projects</h3>
        <BlueBtn label="+ New Project" small onClick={() => { setShowForm(v => !v); setFormError('') }} />
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Project name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            className="calc-input px-3 py-1.5 flex-1 min-w-[200px] max-w-xs"
            autoFocus
          />
          <BlueBtn label={creating ? 'Creating…' : 'Create'} onClick={handleCreate} small />
          <button type="button" className="admin-btn-gray text-xs"
            onClick={() => { setShowForm(false); setNewName(''); setFormError('') }}>
            Cancel
          </button>
          {formError && <span className="text-xs text-red-400">{formError}</span>}
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {['PROJECT','USERS','JOBS','STORAGE','CREATED','STATUS',''].map((h) => (
                <th key={h} className="jobs-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr><td colSpan={7} className="jobs-td text-center text-gray-600">No projects found.</td></tr>
            ) : projects.map((p) => (
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
                    p.isActive ? 'text-green-400 bg-green-400/10 border-green-400/25' : 'text-gray-500 bg-gray-500/10 border-gray-500/25',
                  ].join(' ')}>
                    {p.isActive ? 'Active' : 'Archived'}
                  </span>
                </td>
                <td className="jobs-td">
                  <button type="button" className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    onClick={() => toggleProject(p)}>
                    {p.isActive ? 'Archive' : 'Restore'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. SESSIONS TAB
// ---------------------------------------------------------------------------
interface ApiSession {
  id: string
  user: { email: string }
  ip: string | null
  createdAt: string
  expiresAt: string
}

function SessionsTab() {
  const { data: apiSessions, refetch } = useApiFetch(() => adminApi.sessions())
  const sessions: ApiSession[] = (apiSessions as ApiSession[] | null) ?? []

  const handleDelete = async (id: string) => {
    await adminApi.terminateSession(id)
    await refetch()
  }

  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US')

  return (
    <div className="admin-panel">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">Active Sessions</h3>
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {['USER','IP ADDRESS','CREATED','EXPIRES',''].map((h) => (
                <th key={h} className="jobs-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={5} className="jobs-td text-center text-gray-600">No active sessions.</td></tr>
            ) : sessions.map((s) => (
              <tr key={s.id} className="jobs-tbody-row">
                <td className="jobs-td font-mono text-xs text-gray-300">{s.user?.email ?? '—'}</td>
                <td className="jobs-td font-mono text-xs text-gray-400">{s.ip ?? '—'}</td>
                <td className="jobs-td text-xs text-gray-400">{fmt(s.createdAt)}</td>
                <td className="jobs-td text-xs text-gray-400">{fmt(s.expiresAt)}</td>
                <td className="jobs-td">
                  <GrayBtn label="Delete" onClick={() => handleDelete(s.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. STORAGE TAB
// ---------------------------------------------------------------------------
function StorageTab() {
  const [confirming, setConfirming] = useState(false)
  const [purged,     setPurged]     = useState(false)

  return (
    <div className="admin-panel">
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

      {purged ? (
        <div className="admin-alert-warn">⏳ Storage purge initiated — this may take up to 24 hours.</div>
      ) : confirming ? (
        <div className="admin-danger-box">
          <p className="text-sm text-red-300 font-medium mb-3">Are you absolutely sure? This cannot be undone.</p>
          <div className="flex gap-2">
            <button type="button" className="admin-purge-btn"
              onClick={() => { setPurged(true); setConfirming(false) }}>
              Yes, Purge Storage
            </button>
            <button type="button" className="admin-btn-gray"
              onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="admin-purge-btn" onClick={() => setConfirming(true)}>
          Purge
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 6. PAYMENT INFORMATION TAB
// ---------------------------------------------------------------------------
const PREPAY_OPTIONS = [
  { value: '100',  label: '$100',  bonus: null    },
  { value: '500',  label: '$500',  bonus: '+$50'  },
  { value: '1000', label: '$1000', bonus: '+$150' },
]

function PaymentTab() {
  const [prepay,       setPrepay]       = useState('100')
  const [showEntries,  setShowEntries]  = useState(10)
  const [selected,     setSelected]     = useState<Set<number>>(new Set())
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [showAddCard,  setShowAddCard]  = useState(false)
  const [showReceipt,  setShowReceipt]  = useState(false)

  // Add Card form state
  const [cardNum,  setCardNum]  = useState('')
  const [expiry,   setExpiry]   = useState('')
  const [cvv,      setCvv]      = useState('')
  const [postal,   setPostal]   = useState('')

  // Live data
  const { data: txData,   refetch: refetchTx }    = useApiFetch(() => paymentsApi.transactions())
  const { data: cardData, refetch: refetchCards }  = useApiFetch(() => paymentsApi.cards())
  const { data: period }                           = useApiFetch(() => paymentsApi.period())

  type ApiTx   = import('@/lib/api').ApiTransaction
  type ApiCard = { id: string; brand: string; number: string; exp: string; isDefault: boolean }

  const transactions: ApiTx[]   = (txData   as ApiTx[]   | null) ?? []
  const cards:        ApiCard[] = (cardData  as ApiCard[] | null) ?? []

  const removeCard = async (id: string) => {
    await paymentsApi.removeCard(id)
    await refetchCards()
  }

  const toggleRow = (i: number) =>
    setSelected((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  const selectedOpt = PREPAY_OPTIONS.find((o) => o.value === prepay)!

  return (
    <div className="admin-panel flex flex-col gap-5">

      {/* ── Confirm Payment Modal ─────────────────────────────────────── */}
      {showConfirm && (
        <div className="enterprise-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="payment-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title" className="payment-modal-title">Confirm Payment</h2>
            <hr className="payment-modal-divider" />
            <p className="text-sm text-gray-300 px-5 py-4">
              Your card will be charged <strong className="text-white">${selectedOpt.value}</strong> for <strong className="text-white">${selectedOpt.value}</strong> of credit.
            </p>
            <hr className="payment-modal-divider" />
            <div className="flex items-center gap-6 px-5 py-4 text-sm text-gray-400">
              <span>Card <span className="text-gray-200 ml-1">MasterCard ending in 2393</span></span>
              <span>Expiration <span className="text-gray-200 ml-1">10/25</span></span>
            </div>
            <hr className="payment-modal-divider" />
            <div className="flex items-center gap-3 px-5 py-4 justify-end">
              <button type="button" className="payment-confirm-btn" onClick={() => setShowConfirm(false)}>Confirm</button>
              <button type="button" className="payment-cancel-btn" onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Credit Card Modal ────────────────────────────────────── */}
      {showAddCard && (
        <div className="enterprise-modal-overlay" onClick={() => setShowAddCard(false)}>
          <div className="payment-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="addcard-title">
            <h2 id="addcard-title" className="payment-modal-title">Add Credit Card</h2>
            <hr className="payment-modal-divider" />
            <div className="flex flex-col gap-4 px-5 py-5">
              <div>
                <label className="payment-field-label" htmlFor="cc-number">Card Number</label>
                <input id="cc-number" type="text" placeholder="4111 1111 1111 1111" maxLength={19}
                  value={cardNum} onChange={(e) => setCardNum(e.target.value)}
                  className="payment-field-input" />
              </div>
              <div>
                <label className="payment-field-label" htmlFor="cc-expiry">Expiration Date</label>
                <input id="cc-expiry" type="text" placeholder="MM/YY" maxLength={5}
                  value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  className="payment-field-input" />
              </div>
              <div>
                <label className="payment-field-label" htmlFor="cc-cvv">CVV</label>
                <input id="cc-cvv" type="text" placeholder="123" maxLength={4}
                  value={cvv} onChange={(e) => setCvv(e.target.value)}
                  className="payment-field-input" />
              </div>
              <div>
                <label className="payment-field-label" htmlFor="cc-postal">Postal or Country Code</label>
                <input id="cc-postal" type="text" placeholder="11111"
                  value={postal} onChange={(e) => setPostal(e.target.value)}
                  className="payment-field-input" />
              </div>
            </div>
            <hr className="payment-modal-divider" />
            <div className="flex items-center gap-3 px-5 py-4 justify-end">
              <button type="button" className="payment-confirm-btn" onClick={async () => {
                if (cardNum) {
                  await paymentsApi.addCard({ brand: 'Card', number: cardNum, exp: expiry })
                  await refetchCards()
                  setCardNum(''); setExpiry(''); setCvv(''); setPostal('')
                }
                setShowAddCard(false)
              }}>Ok</button>
              <button type="button" className="payment-cancel-btn" onClick={() => setShowAddCard(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ────────────────────────────────────────────── */}
      {showReceipt && (() => {
        const rows = selected.size > 0
          ? transactions.filter((_, i) => selected.has(i))
          : transactions
        const today = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })

        const handlePrint = () => {
          const w = window.open('', '_blank', 'width=900,height=700')
          if (!w) return
          w.document.write(`<!DOCTYPE html><html><head><title>Conductor Receipt</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; background: #fff; padding: 32px 40px; }
  .receipt-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .receipt-company h1 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .receipt-company p  { font-size: 11px; color: #333; line-height: 1.6; }
  .receipt-logo { font-size: 22px; font-weight: 900; letter-spacing: -1px; border: 2px solid #111; padding: 4px 10px; }
  .receipt-meta { text-align: right; font-size: 11px; margin-top: 4px; }
  .receipt-meta strong { display: inline-block; width: 56px; text-align: left; }
  .receipt-billed { margin-bottom: 20px; }
  .receipt-billed h2 { font-size: 12px; font-weight: 700; margin-bottom: 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  .receipt-billed p  { font-size: 11px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #f0f0f0; font-size: 10px; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #ddd; }
  td { font-size: 10px; padding: 4px 6px; border: 1px solid #ddd; }
  .text-right { text-align: right; }
</style></head><body>
<div class="receipt-header">
  <div class="receipt-company">
    <h1>Conductor Technologies, Inc</h1>
    <p>5540 Centerview Dr, Ste 204<br>PMB 79620<br>Raleigh, North Carolina 27606-8012<br>invoice@conductortech.com</p>
  </div>
  <div>
    <div class="receipt-logo">CONDUCTOR</div>
    <div class="receipt-meta">
      <div><strong>Date</strong> ${today}</div>
      <div><strong>Account</strong> 5094040313528320</div>
    </div>
  </div>
</div>
<div class="receipt-billed">
  <h2>Billed to</h2>
  <p>Silas<br>silasshaibu2@gmail.com</p>
</div>
<table>
  <thead>
    <tr>
      <th>Transaction Date</th>
      <th>Description</th>
      <th>Card Type</th>
      <th>Card Number</th>
      <th>Type</th>
      <th>Authorization Code</th>
      <th>Status</th>
      <th class="text-right">Bonus Credit</th>
      <th class="text-right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${rows.map((t) => `<tr>
      <td>${new Date(t.date).toLocaleString('en-US')}</td>
      <td>${t.description}</td>
      <td>${t.cardType}</td>
      <td>${t.cardNumber}</td>
      <td>${t.type}</td>
      <td>${t.authCode ?? '—'}</td>
      <td>${t.status}</td>
      <td class="text-right">$${(t.bonusCredit ?? 0).toFixed(2)}</td>
      <td class="text-right">$${(t.amount ?? 0).toFixed(2)}</td>
    </tr>`).join('')}
  </tbody>
</table>
</body></html>`)
          w.document.close()
          w.focus()
          w.print()
        }

        return (
          <div className="enterprise-modal-overlay" onClick={() => setShowReceipt(false)}>
            <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="receipt-title">
              {/* header */}
              <div className="receipt-modal-header">
                <div>
                  <h2 id="receipt-title" className="receipt-modal-company">Conductor Technologies, Inc</h2>
                  <p className="receipt-modal-address">
                    5540 Centerview Dr, Ste 204 · PMB 79620<br />
                    Raleigh, North Carolina 27606-8012<br />
                    invoice@conductortech.com
                  </p>
                </div>
                <div className="receipt-modal-right">
                  <div className="receipt-modal-logo">CONDUCTOR</div>
                  <div className="receipt-modal-meta">
                    <div><span className="receipt-modal-meta-label">Date</span>{today}</div>
                    <div><span className="receipt-modal-meta-label">Account</span>5094040313528320</div>
                  </div>
                </div>
              </div>

              {/* billed to */}
              <div className="receipt-modal-billed">
                <p className="receipt-modal-billed-title">Billed to</p>
                <p className="receipt-modal-billed-name">Silas</p>
                <p className="receipt-modal-billed-email">silasshaibu2@gmail.com</p>
              </div>

              {/* table */}
              <div className="receipt-modal-table-wrap">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="receipt-thead-row">
                      {['Transaction Date','Description','Card Type','Card Number','Type','Authorization Code','Status','Bonus Credit','Amount'].map((h) => (
                        <th key={h} className="receipt-th">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t, i) => (
                      <tr key={i} className="receipt-tbody-row">
                        <td className="receipt-td font-mono">{new Date(t.date).toLocaleString('en-US')}</td>
                        <td className="receipt-td">{t.description}</td>
                        <td className="receipt-td">{t.cardType}</td>
                        <td className="receipt-td font-mono">{t.cardNumber}</td>
                        <td className="receipt-td">{t.type}</td>
                        <td className="receipt-td font-mono">{t.authCode ?? '—'}</td>
                        <td className="receipt-td">
                          <span className={t.status === 'settled' ? 'text-green-600' : 'text-red-500'}>{t.status}</span>
                        </td>
                        <td className="receipt-td text-right">${(t.bonusCredit ?? 0).toFixed(2)}</td>
                        <td className="receipt-td text-right font-semibold">${(t.amount ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* actions */}
              <div className="receipt-modal-actions">
                <button type="button" className="payment-confirm-btn" onClick={handlePrint}>Print</button>
                <button type="button" className="payment-cancel-btn" onClick={() => setShowReceipt(false)}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Current Billing Period */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Current Billing Period</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['START DATE','END DATE','CARRY OVER','AMOUNT SPENT','AMOUNT CHARGED','ADDITIONAL CREDITS','OUTSTANDING BALANCE'].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="jobs-tbody-row">
                {[
                  period?.startDate ? new Date(period.startDate).toLocaleDateString('en-US') : '—',
                  period?.endDate   ? new Date(period.endDate).toLocaleDateString('en-US')   : '—',
                  `${(period?.carryOver        ?? 0).toFixed(2)}`,
                  `${(period?.amountSpent      ?? 0).toFixed(2)}`,
                  `${(period?.amountCharged    ?? 0).toFixed(2)}`,
                  `0.00`,
                  `${(period?.outstandingBalance ?? 0).toFixed(2)}`,
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
        {PREPAY_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer mb-1.5">
            <input type="radio" name="prepay" title={`Prepay ${opt.label}`}
              className="accent-blue-500" checked={prepay === opt.value}
              onChange={() => setPrepay(opt.value)} />
            {opt.label}
            {opt.bonus && <span className="text-green-400 text-xs font-semibold">{opt.bonus}</span>}
          </label>
        ))}
        <div className="mt-3">
          <GrayBtn label="Purchase" onClick={() => setShowConfirm(true)} />
        </div>
      </div>

      {/* Credit Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Credit Cards</h3>
        {cards.map((card) => (
          <div key={card.id} className="admin-card-row group">
            <div className="admin-card-chip">{card.brand}</div>
            <span className="text-sm text-gray-300 flex-1">{card.number}</span>
            <span className="text-xs text-gray-500">Exp {card.exp}</span>
            {card.isDefault && <span className="text-xs text-gray-400 italic">default</span>}
            <button
              type="button"
              onClick={() => removeCard(card.id)}
              aria-label={`Remove card ending in ${card.number.slice(-4)}`}
              className="admin-card-delete-btn"
            >
              ×
            </button>
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
            <span className="text-blue-400">Tip:</span> You may select specific rows to print
          </p>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                <th className="jobs-th w-8"><span className="sr-only">Select</span></th>
                {['TRANSACTION DATE','CARD NUMBER','TYPE','STATUS','BONUS CREDIT','AMOUNT'].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={7} className="jobs-td text-center text-gray-600 py-6">No transactions found.</td></tr>
              ) : transactions.slice(0, showEntries).map((t, i) => (
                <tr key={t.id}
                  className={['jobs-tbody-row cursor-pointer', selected.has(i) ? 'bg-blue-500/10' : ''].join(' ')}
                  onClick={() => toggleRow(i)}>
                  <td className="jobs-td text-center">
                    <input type="checkbox" title="Select row" aria-label={`Select transaction ${i + 1}`}
                      className="accent-blue-500" checked={selected.has(i)}
                      onChange={() => toggleRow(i)} onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td className="jobs-td text-xs font-mono text-gray-400">
                    {new Date(t.date).toLocaleString('en-US')}
                  </td>
                  <td className="jobs-td text-xs font-mono text-gray-400">{t.cardNumber}</td>
                  <td className="jobs-td text-xs text-gray-400">{t.type}</td>
                  <td className="jobs-td text-xs">
                    <span className={t.status === 'settled' ? 'text-green-400' : 'text-red-400'}>
                      {t.status}
                    </span>
                  </td>
                  <td className="jobs-td text-right font-mono text-xs text-gray-400">${(t.bonusCredit ?? 0).toFixed(2)}</td>
                  <td className="jobs-td text-right font-mono text-xs text-gray-300">${(t.amount ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            Show
            <select title="Show N entries" value={showEntries}
              onChange={(e) => setShowEntries(Number(e.target.value))}
              className="calc-input px-2 py-1 text-xs w-14">
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            entries
          </div>
          <span>Showing 1 to {Math.min(showEntries, transactions.length)} of {transactions.length} entries</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab config + Page
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'users',    label: 'Users',              Panel: UsersTab    },
  { id: 'limits',   label: 'Cost Limits',        Panel: CostLimitsTab },
  { id: 'projects', label: 'Projects',           Panel: ProjectsTab },
  { id: 'sessions', label: 'Sessions',           Panel: SessionsTab },
  { id: 'storage',  label: 'Storage',            Panel: StorageTab  },
  { id: 'payment',  label: 'Payment Information',Panel: PaymentTab  },
] as const
type TabId = (typeof TABS)[number]['id']

export default function AdminPage() {
  const [active, setActive] = useState<TabId>('users')
  const { Panel } = TABS.find((t) => t.id === active)!

  return (
    <div className="flex flex-col gap-4">
      <div><h1 className="text-2xl font-semibold text-white tracking-tight">Admin</h1></div>
      <div className="admin-tabbar">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActive(tab.id)}
            className={['admin-tab', active === tab.id ? 'admin-tab--active' : ''].join(' ')}>
            {tab.label}
          </button>
        ))}
      </div>
      <Panel />
    </div>
  )
}
