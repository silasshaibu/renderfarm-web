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
// TAB 0: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────

interface OverviewData {
  users:    { total: number; active: number; pending: number; suspended: number; admins: number; newThisWeek: number }
  jobs:     { total: number; running: number; completed: number; failed: number; last24h: number; last7d: number }
  sessions: { total: number; dashboard: number; addon: number }
  credits:  { totalIssued: number; totalConsumed: number; outstanding: number }
  storage:  { fileCount: number; totalBytes: number }
  recentJobs:  { jobNumber: string; title: string; status: string; createdAt: string; userEmail: string }[]
  recentUsers: { id: string; email: string; name: string; createdAt: string; status: string }[]
}

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4 flex flex-col gap-1">
      <p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      {sub && <p className="text-[11px] text-gray-600">{sub}</p>}
    </div>
  )
}

const JOB_STATUS_COLORS: Record<string, string> = {
  running:  'text-blue-400 bg-blue-400/10 border-blue-400/25',
  success:  'text-green-400 bg-green-400/10 border-green-400/25',
  failed:   'text-red-400 bg-red-400/10 border-red-400/25',
  queued:   'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  syncing:  'text-blue-300 bg-blue-300/10 border-blue-300/25',
  pending:  'text-gray-400 bg-gray-400/10 border-gray-400/25',
}

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function OverviewTab() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
  const { data, loading } = useApiFetch<OverviewData>(() =>
    fetch('/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
  )

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  if (loading || !data) {
    return <div className="flex items-center gap-2 text-gray-500 text-sm py-8"><Spinner /> Loading overview…</div>
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Users ─────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Users</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Users"   value={data.users.total} />
          <StatCard label="Active"        value={data.users.active}      color="text-green-400" />
          <StatCard label="Pending"       value={data.users.pending}     color={data.users.pending > 0 ? 'text-amber-400' : 'text-white'} />
          <StatCard label="Suspended"     value={data.users.suspended}   color={data.users.suspended > 0 ? 'text-red-400' : 'text-white'} />
          <StatCard label="Admins"        value={data.users.admins}      color="text-purple-400" />
          <StatCard label="New This Week" value={data.users.newThisWeek} color="text-blue-400" />
        </div>
      </div>

      {/* ── Jobs ──────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Render Jobs</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Jobs"  value={data.jobs.total} />
          <StatCard label="Running Now" value={data.jobs.running}   color={data.jobs.running > 0 ? 'text-blue-400' : 'text-white'} />
          <StatCard label="Completed"   value={data.jobs.completed} color="text-green-400" />
          <StatCard label="Failed"      value={data.jobs.failed}    color={data.jobs.failed > 0 ? 'text-red-400' : 'text-white'} />
          <StatCard label="Last 24 hrs" value={data.jobs.last24h} />
          <StatCard label="Last 7 days" value={data.jobs.last7d} />
        </div>
      </div>

      {/* ── Credits + Sessions + Storage ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Credits</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Issued</span>
              <span className="text-white font-mono">${data.credits.totalIssued.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Consumed</span>
              <span className="text-red-400 font-mono">−${data.credits.totalConsumed.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-white/8 pt-2 mt-1">
              <span className="text-gray-300 font-medium">Outstanding</span>
              <span className={`font-mono font-semibold ${data.credits.outstanding >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${data.credits.outstanding.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Active Sessions</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total</span>
              <span className="text-white font-mono">{data.sessions.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> Dashboard
              </span>
              <span className="text-white font-mono">{data.sessions.dashboard}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-400">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400" /> Addon
              </span>
              <span className="text-white font-mono">{data.sessions.addon}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Storage</p>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Files</span>
              <span className="text-white font-mono">{data.storage.fileCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Total Size</span>
              <span className="text-white font-mono">{fmtBytes(data.storage.totalBytes)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent Jobs</p>
          {data.recentJobs.length === 0 ? (
            <p className="text-gray-600 text-sm">No jobs yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/5">
                {data.recentJobs.map(j => (
                  <tr key={j.jobNumber}>
                    <td className="py-2 pr-3 font-mono text-xs text-blue-400 whitespace-nowrap">{String(j.jobNumber)}</td>
                    <td className="py-2 pr-3 text-gray-300 text-xs truncate max-w-[120px]">{String(j.title)}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${JOB_STATUS_COLORS[String(j.status)] ?? 'text-gray-400 border-gray-400/25'}`}>
                        {String(j.status)}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(String(j.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white/[0.03] border border-white/8 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Recent Signups</p>
          {data.recentUsers.length === 0 ? (
            <p className="text-gray-600 text-sm">No users yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/5">
                {data.recentUsers.map(u => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3 text-gray-300 text-xs truncate max-w-[160px]">{String(u.email)}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        u.status === 'active'    ? 'text-green-400 border-green-400/25 bg-green-400/10' :
                        u.status === 'suspended' ? 'text-red-400 border-red-400/25 bg-red-400/10' :
                        u.status === 'pending'   ? 'text-amber-400 border-amber-400/25 bg-amber-400/10' :
                        'text-gray-400 border-gray-400/25'}`}>
                        {String(u.status)}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs whitespace-nowrap">{fmtDate(String(u.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: USERS
// ─────────────────────────────────────────────────────────────────────────────

// Credit history modal for admin
interface CreditItem { id: number; amount: number; type: string; description: string; jobId: number | null; createdAt: string; balance: number }
const CREDIT_TYPE_COLORS: Record<string, string> = {
  welcome_bonus: 'text-green-400 bg-green-400/10 border-green-400/25',
  purchased:     'text-blue-400 bg-blue-400/10 border-blue-400/25',
  admin_grant:   'text-purple-400 bg-purple-400/10 border-purple-400/25',
  refund:        'text-cyan-400 bg-cyan-400/10 border-cyan-400/25',
  usage:         'text-gray-500 bg-gray-500/10 border-gray-500/25',
}

const CREDIT_PRESETS = [5, 10, 25, 50, 100, 200]

function AdminCreditModal({ user, onClose, onRefresh, defaultTab = 'history' }: { user: AdminUser; onClose(): void; onRefresh(): void; defaultTab?: 'history' | 'grant' | 'limit' }) {
  const toast = useToast()
  const [tab,          setTab]          = useState<'history'|'grant'|'limit'>(defaultTab)
  const [items,        setItems]        = useState<CreditItem[]>([])
  const [balance,      setBalance]      = useState(user.creditBalance)
  const [page,         setPage]         = useState(1)
  const [pages,        setPages]        = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [amount,       setAmount]       = useState('')
  const [reason,       setReason]       = useState('')
  const [granting,     setGranting]     = useState(false)
  const [creditLimit,  setCreditLimit]  = useState<number | null>(null)
  const [limitInput,   setLimitInput]   = useState('')
  const [savingLimit,  setSavingLimit]  = useState(false)

  const loadHistory = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const d = await adminApi.userCredits(user.id, p) as { balance: number; items: CreditItem[]; pages: number; page: number }
      setBalance(d.balance); setItems(d.items); setPages(d.pages); setPage(d.page)
    } catch { toast.error('Failed to load credit history') }
    finally { setLoading(false) }
  }, [user.id, toast])

  useEffect(() => { loadHistory(1) }, [loadHistory])

  useEffect(() => {
    adminApi.getCreditLimit(user.id)
      .then(d => { setCreditLimit(d.creditLimit); setLimitInput(String(d.creditLimit)) })
      .catch(() => null)
  }, [user.id])

  const handleSaveLimit = async () => {
    const val = parseFloat(limitInput)
    if (isNaN(val) || val < 0) { toast.error('Enter a valid non-negative number'); return }
    setSavingLimit(true)
    try {
      await adminApi.setCreditLimit(user.id, val)
      setCreditLimit(val)
      toast.success(`Outstanding balance limit set to $${val.toFixed(2)} for ${user.email}`)
      onRefresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSavingLimit(false) }
  }

  const handleGrant = async () => {
    const amt = parseFloat(amount)
    if (!amt || !reason.trim()) { toast.error('Amount and reason required'); return }
    setGranting(true)
    try {
      await adminApi.grantCredits(user.id, amt, reason.trim())
      toast.success(`Credits ${amt > 0 ? 'granted' : 'deducted'} for ${user.email}`)
      setAmount(''); setReason(''); setTab('history'); loadHistory(1); onRefresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setGranting(false) }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div className="cost-limit-modal-card" style={{ maxWidth: 680, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="cost-limit-modal-title">
          <div>
            <span>Credits — {user.email}</span>
            <span className={`ml-2 text-sm font-mono ${balance > 10 ? 'text-white' : balance >= 5 ? 'text-amber-400' : 'text-red-400'}`}>${balance.toFixed(2)}</span>
          </div>
          <button type="button" className="cost-limit-close-btn" onClick={onClose}>×</button>
        </div>
        <hr className="payment-modal-divider" />
        <div className="flex gap-3 mb-4">
          <button type="button" onClick={() => setTab('history')}
            className={`text-xs px-3 py-1.5 rounded ${tab==='history' ? 'bg-blue-600 text-white' : 'text-gray-400 border border-white/10'}`}>
            History
          </button>
          <button type="button" onClick={() => setTab('grant')}
            className={`text-xs px-3 py-1.5 rounded ${tab==='grant' ? 'bg-blue-600 text-white' : 'text-gray-400 border border-white/10'}`}>
            Grant / Deduct
          </button>
          <button type="button" onClick={() => setTab('limit')}
            className={`text-xs px-3 py-1.5 rounded ${tab==='limit' ? 'bg-purple-600 text-white' : 'text-gray-400 border border-white/10'}`}>
            Balance Limit
          </button>
        </div>

        {tab === 'history' && (
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {loading ? <p className="text-gray-500 text-sm text-center py-8">Loading…</p> : items.length === 0
              ? <p className="text-gray-600 text-sm text-center py-8">No transactions yet.</p>
              : <table className="w-full text-sm">
                  <thead><tr className="text-left">
                    {['Date','Type','Description','Amount','Balance'].map(h => (
                      <th key={h} className="text-xs text-gray-500 font-medium uppercase tracking-wider pb-2 pr-3">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-white/5">
                    {items.map(item => {
                      const color = CREDIT_TYPE_COLORS[item.type] ?? 'text-gray-500 bg-gray-500/10 border-gray-500/25'
                      return (
                        <tr key={String(item.id)}>
                          <td className="py-2 pr-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(String(item.createdAt))}</td>
                          <td className="py-2 pr-3"><span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-medium ${color}`}>{item.type}</span></td>
                          <td className="py-2 pr-3 text-gray-300 text-xs max-w-[160px] truncate">{String(item.description)}</td>
                          <td className={`py-2 pr-3 text-xs font-mono font-medium ${item.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>{item.amount >= 0 ? '+' : ''}{item.amount.toFixed(2)}</td>
                          <td className="py-2 text-xs font-mono text-gray-400">${item.balance.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            }
            {pages > 1 && (
              <div className="flex gap-2 justify-center mt-3">
                <button type="button" onClick={() => loadHistory(page-1)} disabled={page<=1||loading}
                  className="text-xs px-2 py-1 text-gray-400 border border-white/10 rounded disabled:opacity-40">‹</button>
                <span className="text-xs text-gray-600 self-center">{page}/{pages}</span>
                <button type="button" onClick={() => loadHistory(page+1)} disabled={page>=pages||loading}
                  className="text-xs px-2 py-1 text-gray-400 border border-white/10 rounded disabled:opacity-40">›</button>
              </div>
            )}
          </div>
        )}

        {tab === 'grant' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Quick add credits</p>
              <div className="flex flex-wrap gap-2">
                {CREDIT_PRESETS.map(p => (
                  <button key={p} type="button"
                    onClick={() => setAmount(String(p))}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${amount === String(p) ? 'bg-green-600 border-green-500 text-white' : 'border-white/10 text-gray-300 hover:border-green-500/50 hover:text-green-400'}`}>
                    +${p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 w-40">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Amount ($)</label>
                <input type="number" step="0.01" placeholder="Custom amount"
                  value={amount} onChange={e => setAmount(e.target.value)}
                  className="calc-input px-3 py-2 text-sm" />
                <p className="text-[10px] text-gray-600">Negative to deduct</p>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Reason (required)</label>
                <input type="text" placeholder="e.g. Billing offset, goodwill credit…"
                  value={reason} onChange={e => setReason(e.target.value)}
                  className="calc-input px-3 py-2 text-sm" />
              </div>
            </div>
            {amount && !isNaN(parseFloat(amount)) && (
              <p className="text-xs text-gray-400">
                New balance after:&nbsp;
                <span className={parseFloat(amount) >= 0 ? 'text-green-400' : 'text-red-400'}>
                  ${(balance + parseFloat(amount)).toFixed(2)}
                </span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <GrayBtn label="Cancel" onClick={onClose} />
              <button type="button" onClick={handleGrant} disabled={granting || !amount || !reason.trim()}
                className="admin-btn-blue md">{granting ? 'Saving…' : parseFloat(amount||'0') >= 0 ? 'Grant Credits' : 'Deduct Credits'}</button>
            </div>
          </div>
        )}

        {tab === 'limit' && (
          <div className="flex flex-col gap-4">
            <div className="bg-purple-900/20 border border-purple-500/20 rounded p-3">
              <p className="text-xs text-purple-300 font-medium mb-1">Outstanding Balance Limit</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                By default users are blocked from submitting jobs when their balance reaches $0.
                Set a limit here to allow a user to run jobs on credit — they can go up to <strong className="text-white">−$[limit]</strong> before being blocked.
                Set to <strong className="text-white">0</strong> to restore the default block-at-zero behaviour.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider">Limit ($)</label>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-sm">−$</span>
                  <input type="number" min="0" step="1" placeholder="0"
                    value={limitInput} onChange={e => setLimitInput(e.target.value)}
                    className="calc-input px-3 py-2 w-32 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 mb-0.5">
                {[0, 50, 100, 200, 500].map(p => (
                  <button key={p} type="button"
                    onClick={() => setLimitInput(String(p))}
                    className={`text-xs px-2.5 py-1.5 rounded border transition-colors ${limitInput === String(p) ? 'bg-purple-600 border-purple-500 text-white' : 'border-white/10 text-gray-400 hover:border-purple-500/50 hover:text-purple-300'}`}>
                    {p === 0 ? 'None' : `$${p}`}
                  </button>
                ))}
              </div>
            </div>
            {creditLimit !== null && (
              <p className="text-xs text-gray-500">
                Current limit: <span className="text-white font-mono">{creditLimit === 0 ? 'None (block at $0)' : `−$${creditLimit.toFixed(2)}`}</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <GrayBtn label="Cancel" onClick={onClose} />
              <button type="button" onClick={handleSaveLimit} disabled={savingLimit}
                className="text-xs px-4 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50 transition-colors">
                {savingLimit ? 'Saving…' : 'Save Limit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Abuse signals modal
interface AbuseSignal { id: number; signalType: string; matchedEmail: string | null; details: string; reviewed: boolean; actionTaken: string; createdAt: string }
function AbuseSignalModal({ user, onClose, onRefresh }: { user: AdminUser; onClose(): void; onRefresh(): void }) {
  const toast = useToast()
  const [signals,  setSignals]  = useState<AbuseSignal[]>([])
  const [loading,  setLoading]  = useState(true)
  const [actioning, setActioning] = useState<number | null>(null)

  useEffect(() => {
    adminApi.abuseSignals(user.id)
      .then(d => setSignals(d as AbuseSignal[]))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false))
  }, [user.id, toast])

  const take = async (signalId: number, action: 'allow' | 'block' | 'ignore') => {
    setActioning(signalId)
    try {
      await adminApi.reviewAbuseSignal(user.id, signalId, action)
      toast.success(`Signal ${action}ed.`)
      setSignals(s => s.map(x => x.id === signalId ? { ...x, reviewed: true, actionTaken: action } : x))
      onRefresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setActioning(null) }
  }

  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div className="cost-limit-modal-card" style={{ maxWidth: 560, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="cost-limit-modal-title">
          <span>Abuse Signals — {user.email}</span>
          <button type="button" className="cost-limit-close-btn" onClick={onClose}>×</button>
        </div>
        <hr className="payment-modal-divider" />
        {loading ? <p className="text-gray-500 text-sm text-center py-6">Loading…</p> : signals.length === 0
          ? <p className="text-gray-600 text-sm text-center py-6">No abuse signals found.</p>
          : <div className="flex flex-col gap-4" style={{ maxHeight: 400, overflowY: 'auto' }}>
              {signals.map(s => (
                <div key={s.id} className="border border-white/10 rounded p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-amber-400 font-medium">{s.signalType}</span>
                    {s.reviewed && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${s.actionTaken === 'allow' ? 'text-green-400 bg-green-400/10 border-green-400/25' : s.actionTaken === 'block' ? 'text-red-400 bg-red-400/10 border-red-400/25' : 'text-gray-400 bg-gray-400/10 border-gray-400/25'}`}>{s.actionTaken}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{String(s.details)}</p>
                  {s.matchedEmail && <p className="text-xs text-gray-500 mb-2">Matched: {s.matchedEmail}</p>}
                  {!s.reviewed && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => take(s.id, 'allow')} disabled={actioning===s.id}
                        className="text-xs px-2 py-1 rounded bg-green-800/40 border border-green-700/40 text-green-300 hover:bg-green-700/40 disabled:opacity-40">
                        Allow — Grant Bonus
                      </button>
                      <button type="button" onClick={() => take(s.id, 'block')} disabled={actioning===s.id}
                        className="text-xs px-2 py-1 rounded bg-red-900/40 border border-red-700/40 text-red-300 hover:bg-red-800/40 disabled:opacity-40">
                        Block — Suspend
                      </button>
                      <button type="button" onClick={() => take(s.id, 'ignore')} disabled={actioning===s.id}
                        className="text-xs px-2 py-1 rounded text-gray-500 border border-white/10 hover:text-gray-300 disabled:opacity-40">
                        Ignore
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  )
}

// Suspend modal
function SuspendModal({ user, onClose, onRefresh }: { user: AdminUser; onClose(): void; onRefresh(): void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const isSuspended = user.status === 'suspended'

  const handle = async () => {
    if (!isSuspended && !reason.trim()) { toast.error('Reason is required'); return }
    setSaving(true)
    try {
      if (isSuspended) {
        await adminApi.unsuspend(user.id)
        toast.success(`${user.email} unsuspended.`)
      } else {
        await adminApi.suspend(user.id, reason.trim())
        toast.success(`${user.email} suspended.`)
      }
      onRefresh(); onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div className="cost-limit-modal-card admin-confirm-card" onClick={e => e.stopPropagation()}>
        <div className="cost-limit-modal-title">
          <span>{isSuspended ? 'Unsuspend' : 'Suspend'} — {user.email}</span>
          <button type="button" className="cost-limit-close-btn" onClick={onClose}>×</button>
        </div>
        <hr className="payment-modal-divider" />
        {isSuspended ? (
          <p className="admin-confirm-body">Restore access for {user.email}?</p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-400">Provide a reason for suspending this account (sent to user by email).</p>
            <textarea rows={3} placeholder="Reason for suspension..."
              value={reason} onChange={e => setReason(e.target.value)}
              className="calc-input px-3 py-2 text-sm w-full resize-none" />
          </div>
        )}
        <div className="admin-confirm-actions">
          <GrayBtn label="Cancel" onClick={onClose} />
          <button type="button" onClick={handle} disabled={saving}
            className={isSuspended ? 'payment-confirm-btn' : 'admin-confirm-remove-btn'}>
            {saving ? 'Saving…' : isSuspended ? 'Unsuspend' : 'Suspend Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Impersonation banner (shown after impersonating)
function ImpersonateBanner({ email, onEnd }: { email: string; onEnd(): void }) {
  return (
    <div style={{ background: '#78350f', borderBottom: '2px solid #d97706', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
      <span style={{ color: '#fef3c7', fontSize: 13, fontWeight: 600 }}>⚠ You are impersonating {email}</span>
      <button type="button" onClick={onEnd}
        style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
        End Session
      </button>
    </div>
  )
}

// Audit log modal
interface AuditEntry { id: number; action: string; details: Record<string, unknown>; ip: string; createdAt: string; adminEmail: string; targetEmail: string }
function AuditLogModal({ onClose }: { onClose(): void }) {
  const toast = useToast()
  const [items,   setItems]   = useState<AuditEntry[]>([])
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const d = await adminApi.auditLog(p) as { items: AuditEntry[]; pages: number; page: number }
      setItems(d.items); setPages(d.pages); setPage(d.page)
    } catch { toast.error('Failed to load audit log') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load(1) }, [load])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div className="cost-limit-modal-card" style={{ maxWidth: 780, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="cost-limit-modal-title">
          <span>Audit Log</span>
          <button type="button" className="cost-limit-close-btn" onClick={onClose}>×</button>
        </div>
        <hr className="payment-modal-divider" />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
            : items.length === 0 ? <p className="text-gray-600 text-sm text-center py-8">No audit log entries.</p>
            : <table className="w-full text-sm">
                <thead><tr className="text-left">
                  {['Date','Admin','Target','Action','Details'].map(h => (
                    <th key={h} className="text-xs text-gray-500 font-medium uppercase tracking-wider pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-white/5">
                  {items.map(e => (
                    <tr key={e.id}>
                      <td className="py-2 pr-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                      <td className="py-2 pr-3 text-gray-300 text-xs">{e.adminEmail}</td>
                      <td className="py-2 pr-3 text-gray-400 text-xs">{e.targetEmail || '—'}</td>
                      <td className="py-2 pr-3 text-xs"><span className="text-blue-400">{e.action}</span></td>
                      <td className="py-2 text-xs text-gray-500 max-w-[200px] truncate">{JSON.stringify(e.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
        {pages > 1 && (
          <div className="flex gap-2 justify-center pt-3 border-t border-white/5">
            <button type="button" onClick={() => load(page-1)} disabled={page<=1||loading} className="text-xs px-2 py-1 text-gray-400 border border-white/10 rounded disabled:opacity-40">‹ Prev</button>
            <span className="text-xs text-gray-600 self-center">Page {page} of {pages}</span>
            <button type="button" onClick={() => load(page+1)} disabled={page>=pages||loading} className="text-xs px-2 py-1 text-gray-400 border border-white/10 rounded disabled:opacity-40">Next ›</button>
          </div>
        )}
      </div>
    </div>
  )
}

function UsersTab() {
  const toast    = useToast()
  const router   = useRouter()
  const [require2fa,      setRequire2fa]      = useState(false)
  const [newEmail,        setNewEmail]        = useState('')
  const [newAdmin,        setNewAdmin]        = useState(false)
  const [emailError,      setEmailError]      = useState('')
  const [addingUser,      setAddingUser]      = useState(false)
  const [userFilter,      setUserFilter]      = useState('')
  const [statusFilter,    setStatusFilter]    = useState('')
  const [saved2fa,        setSaved2fa]        = useState(false)
  const [saving2fa,       setSaving2fa]       = useState(false)
  const [creditTarget,    setCreditTarget]    = useState<AdminUser | null>(null)
  const [creditTab,       setCreditTab]       = useState<'history'|'grant'|'limit'>('history')
  const [abuseTarget,     setAbuseTarget]     = useState<AdminUser | null>(null)
  const [suspendTarget,   setSuspendTarget]   = useState<AdminUser | null>(null)
  const [showAuditLog,    setShowAuditLog]    = useState(false)
  const [impersonating,   setImpersonating]   = useState<{ email: string } | null>(null)
  const [openActions,     setOpenActions]     = useState<string | null>(null)

  const { data: apiUsers, loading, refetch } = useApiFetch(() => adminApi.users())
  const users: AdminUser[] = (apiUsers as AdminUser[] | null) ?? []

  // Load credits overview + 2FA setting
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    fetch('/api/wrangler-settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((s: Record<string, unknown> | null) => { if (s?.require2fa !== undefined) setRequire2fa(Boolean(s.require2fa)) })
      .catch(() => null)
  }, [])

  const handle2faSave = async () => {
    setSaving2fa(true)
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    const ok = await fetch('/api/wrangler-settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ require2fa }),
    }).then(r => r.ok).catch(() => false)
    setSaving2fa(false)
    if (ok) { setSaved2fa(true); setTimeout(() => setSaved2fa(false), 2000); toast.success('2FA setting saved.') }
    else toast.error('Failed to save 2FA setting.')
  }

  const handleAddUser = async () => {
    setEmailError('')
    if (!newEmail) { setEmailError('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { setEmailError('Invalid email'); return }
    setAddingUser(true)
    try {
      await adminApi.inviteUser(newEmail, newAdmin)
      toast.success(`Invitation sent to ${newEmail}.`)
      setNewEmail(''); setNewAdmin(false); await refetch()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed'
      if (msg.includes('already exists')) setEmailError('User already exists')
      else toast.error(msg)
    } finally { setAddingUser(false) }
  }

  const handleImpersonate = async (u: AdminUser) => {
    try {
      const d = await adminApi.impersonate(u.id) as { access_token: string; user: { id: string; email: string; isAdmin: boolean }; impersonator_email: string }
      localStorage.setItem('rf_token', d.access_token)
      localStorage.setItem('rf_user', JSON.stringify(d.user))
      localStorage.setItem('rf_impersonating', JSON.stringify({ email: u.email, adminEmail: d.impersonator_email }))
      setImpersonating({ email: u.email })
      router.push('/')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to impersonate') }
  }

  const handleReset2fa = async (u: AdminUser) => {
    if (!confirm(`Reset 2FA for ${u.email}? They will need to re-enrol next login.`)) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res = await fetch(`/api/admin/users/${u.id}/reset-2fa`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error((await res.json() as { message?: string }).message ?? 'Failed')
      toast.success(`2FA reset for ${u.email}`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
  }

  const handleEndImpersonation = () => {
    localStorage.removeItem('rf_token')
    localStorage.removeItem('rf_user')
    localStorage.removeItem('rf_impersonating')
    setImpersonating(null)
    window.location.href = '/admin'
  }

  // Restore impersonation state on mount
  useEffect(() => {
    const imp = localStorage.getItem('rf_impersonating')
    if (imp) { try { setImpersonating(JSON.parse(imp) as { email: string }) } catch { null } }
  }, [])

  const filtered = users.filter(u => {
    const emailOk  = userFilter   ? u.email.toLowerCase().includes(userFilter.toLowerCase()) : true
    const statusOk = statusFilter ? u.status === statusFilter : true
    return emailOk && statusOk
  })

  const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  return (
    <div>
      {impersonating && <ImpersonateBanner email={impersonating.email} onEnd={handleEndImpersonation} />}
      {creditTarget  && <AdminCreditModal  user={creditTarget}  defaultTab={creditTab} onClose={() => setCreditTarget(null)}  onRefresh={refetch} />}
      {abuseTarget   && <AbuseSignalModal  user={abuseTarget}   onClose={() => setAbuseTarget(null)}   onRefresh={refetch} />}
      {suspendTarget && <SuspendModal      user={suspendTarget} onClose={() => setSuspendTarget(null)} onRefresh={refetch} />}
      {showAuditLog  && <AuditLogModal     onClose={() => setShowAuditLog(false)} />}


      {/* 2FA Setting */}
      <SectionBox title="Account Security Settings">
        <label className="flex items-start gap-2 cursor-pointer mb-3">
          <input type="checkbox" title="Require 2FA" aria-label="Require 2FA for all users"
            className="mt-0.5 accent-blue-500" checked={require2fa} onChange={() => setRequire2fa(v => !v)} />
          <div>
            <span className="text-sm text-gray-200">Require 2FA for all users</span>
            <p className="text-xs text-gray-500 mt-0.5">When enabled, users must set up two-factor authentication.</p>
          </div>
        </label>
        <button type="button" onClick={handle2faSave} disabled={saving2fa} className="admin-btn-blue md">
          {saving2fa ? <><Spinner /> Saving…</> : saved2fa ? '✓ Saved' : 'Save Changes'}
        </button>
      </SectionBox>

      {/* Add Users */}
      <SectionBox title="Add Users">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px] max-w-xs">
            <input type="email" placeholder="Email" aria-label="New user email"
              value={newEmail} onChange={e => { setNewEmail(e.target.value); setEmailError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleAddUser() }}
              className={['calc-input px-3 py-1.5', emailError ? 'border-red-500' : ''].join(' ')} />
            {emailError && <span className="text-xs text-red-400">{emailError}</span>}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer mt-1.5">
            <input type="checkbox" title="Admin" className="accent-blue-500"
              checked={newAdmin} onChange={() => setNewAdmin(v => !v)} />
            Admin
          </label>
          <BlueBtn label={addingUser ? 'Adding…' : 'Add User'} onClick={handleAddUser} disabled={addingUser} />
        </div>
      </SectionBox>

      {/* Manage Users */}
      <SectionBox title="Manage Users" action={
        <button type="button" onClick={() => setShowAuditLog(true)}
          className="text-xs text-gray-400 border border-white/10 px-3 py-1.5 rounded hover:text-white hover:border-white/20 transition-colors">
          View Audit Log
        </button>
      }>
        <div className="flex items-center justify-end mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <label className="flex items-center gap-1.5">
              Filter:
              <input type="text" title="Filter by email" value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
                className="calc-input px-2 py-1 w-36 text-sm" />
            </label>
            <label className="flex items-center gap-1.5">
              Status:
              <select title="Filter by status" value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="calc-input px-2 py-1 text-sm w-36">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
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
                  {['EMAIL','NAME','STATUS','ADMIN','CREDITS','JOBS','JOINED','FLAGS','ACTIONS'].map(h => (
                    <th key={h} className="jobs-th whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="jobs-td text-center text-gray-600 py-6">No users found.</td></tr>
                ) : filtered.map(u => (
                  <tr key={u.id} className="jobs-tbody-row">
                    <td className="jobs-td font-mono text-xs text-gray-300">{u.email}</td>
                    <td className="jobs-td text-xs text-gray-400">{u.name || '—'}</td>
                    <td className="jobs-td">
                      <StatusBadge status={u.status} />
                      {u.status === 'suspended' && u.suspensionReason && (
                        <p className="text-[10px] text-red-400/70 mt-0.5 max-w-[120px] truncate">{u.suspensionReason}</p>
                      )}
                    </td>
                    <td className="jobs-td">
                      <input type="checkbox" title="Admin" aria-label={`Admin: ${u.email}`}
                        className="accent-blue-500" checked={u.isAdmin}
                        onChange={async () => { try { await adminApi.updateUser(u.id, { isAdmin: !u.isAdmin }); await refetch() } catch { toast.error('Failed') } }} />
                    </td>
                    <td className="jobs-td">
                      <button type="button" onClick={() => { setCreditTab('history'); setCreditTarget(u) }}
                        className={`text-xs font-mono font-medium hover:underline cursor-pointer ${u.creditBalance > 10 ? 'text-white' : u.creditBalance >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
                        ${u.creditBalance.toFixed(2)}
                      </button>
                    </td>
                    <td className="jobs-td text-xs text-gray-400 text-right">{u.jobCount}</td>
                    <td className="jobs-td text-xs text-gray-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="jobs-td">
                      {u.abuseSignals > 0 && (
                        <button type="button" onClick={() => setAbuseTarget(u)}
                          className="text-amber-400 text-xs hover:text-amber-300 transition-colors">
                          ⚠ {u.abuseSignals}
                        </button>
                      )}
                      {u.status === 'suspended' && <span className="text-red-500 text-xs ml-1">🔴</span>}
                    </td>
                    <td className="jobs-td relative">
                      <button type="button"
                        onClick={() => setOpenActions(openActions === u.id ? null : u.id)}
                        className="text-xs text-gray-400 border border-white/10 px-2 py-1 rounded hover:text-white hover:border-white/20 transition-colors">
                        Actions ▾
                      </button>
                      {openActions === u.id && (
                        <div className="absolute right-0 mt-1 w-44 bg-[#1e2433] border border-white/10 rounded shadow-xl z-20 text-xs"
                          style={{ top: '100%' }}>
                          {[
                            { label: 'View Credit History',   fn: () => { setCreditTab('history'); setCreditTarget(u); setOpenActions(null) } },
                            { label: 'Grant Credits',         fn: () => { setCreditTab('grant');   setCreditTarget(u); setOpenActions(null) } },
                            { label: 'Set Balance Limit',     fn: () => { setCreditTab('limit');   setCreditTarget(u); setOpenActions(null) } },
                            { label: u.status==='suspended' ? 'Unsuspend Account' : 'Suspend Account',
                              fn: () => { setSuspendTarget(u); setOpenActions(null) },
                              red: u.status !== 'suspended' },
                            { label: 'Review Abuse Signals',  fn: () => { setAbuseTarget(u);  setOpenActions(null) }, hidden: u.abuseSignals === 0 },
                            { label: 'Reset 2FA',             fn: () => { handleReset2fa(u);    setOpenActions(null) } },
                            { label: 'Impersonate User',      fn: () => { handleImpersonate(u); setOpenActions(null) }, amber: true },
                          ].filter(x => !x.hidden).map(({ label, fn, red, amber }) => (
                            <button key={label} type="button" onClick={fn}
                              className={`w-full text-left px-3 py-2 hover:bg-white/5 transition-colors ${red ? 'text-red-400' : amber ? 'text-amber-400' : 'text-gray-300'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
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
                {['PROJECT','STATUS',''].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr><td colSpan={3} className="jobs-td text-center text-gray-600 py-6">No projects found.</td></tr>
              ) : projects.map(p => (
                <tr key={p.id} className="jobs-tbody-row">
                  <td className="jobs-td text-gray-200 font-medium">{p.name}</td>
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
  lastUsedAt: string | null
  source: 'dashboard' | 'addon' | 'api'
}

const SESSION_SOURCE_STYLES: Record<string, string> = {
  dashboard: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
  addon:     'bg-purple-900/40 text-purple-300 border-purple-700/40',
  api:       'bg-gray-700/40 text-gray-400 border-gray-600/40',
}

function SessionsTab() {
  const toast = useToast()
  const { data: apiSessions, loading, refetch, syncing } = useApiFetch(() => adminApi.sessions())
  const sessions: ApiSession[] = (apiSessions as ApiSession[] | null) ?? []
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [cleaning,  setCleaning]  = useState(false)

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

  const handleCleanUp = async () => {
    setCleaning(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res = await fetch('/api/auth/cleanup', { headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json() as { expiredDeleted?: number; duplicatesRemoved?: number }
      toast.success(`Cleaned up: ${d.expiredDeleted ?? 0} expired, ${d.duplicatesRemoved ?? 0} duplicate sessions removed`)
      await refetch()
    } catch { toast.error('Cleanup failed') }
    finally { setCleaning(false) }
  }

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    } catch { return iso }
  }

  return (
    <div className="admin-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-200">Active Sessions</h3>
        <div className="flex items-center gap-3">
          {syncing && <span className="text-xs text-gray-500">Refreshing…</span>}
          <button type="button" onClick={handleCleanUp} disabled={cleaning}
            className="text-xs px-3 py-1.5 rounded border border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:text-amber-300 transition-colors disabled:opacity-50">
            {cleaning ? 'Cleaning…' : 'Clean Up Duplicates'}
          </button>
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
                {['USER','IP ADDRESS','SOURCE','CREATED','EXPIRES',''].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={6} className="jobs-td text-center text-gray-600 py-6">No active sessions.</td></tr>
              ) : sessions.map(s => (
                <tr key={s.id} className="jobs-tbody-row">
                  <td className="jobs-td font-mono text-xs text-gray-300">{s.user?.email ?? '—'}</td>
                  <td className="jobs-td font-mono text-xs text-gray-400">{s.ip ?? '—'}</td>
                  <td className="jobs-td">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${SESSION_SOURCE_STYLES[s.source] ?? SESSION_SOURCE_STYLES.api}`}>
                      {s.source ?? 'dashboard'}
                    </span>
                  </td>
                  <td className="jobs-td text-xs text-gray-400 whitespace-nowrap">{fmt(s.createdAt)}</td>
                  <td className="jobs-td text-xs text-gray-400 whitespace-nowrap">{fmt(s.expiresAt)}</td>
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
      <p className="text-xs text-gray-600 mt-3">Auto-refreshes every 30 seconds. Cleanup also runs automatically every hour.</p>
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
  { id: 'overview',  label: 'Overview',            Panel: OverviewTab   },
  { id: 'users',     label: 'Users',               Panel: UsersTab      },
  { id: 'limits',    label: 'Cost Limits',         Panel: CostLimitsTab },
  { id: 'projects',  label: 'Projects',            Panel: ProjectsTab   },
  { id: 'sessions',  label: 'Sessions',            Panel: SessionsTab   },
  { id: 'storage',   label: 'Storage',             Panel: StorageTab    },
  { id: 'payment',   label: 'Payment Information', Panel: PaymentTab    },
] as const
type TabId = (typeof TABS)[number]['id']

export default function AdminPage() {
  const router = useRouter()
  const [active,       setActive]       = useState<TabId>('overview')
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
