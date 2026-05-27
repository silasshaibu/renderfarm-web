'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RCTooltip,
  ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  BarChart, Bar, LabelList,
} from 'recharts'

// ─────────────────────────── constants ───────────────────────────────────────
const PIE_COLORS = ['#3b82f6','#22d3ee','#f59e0b','#a855f7','#10b981','#f97316','#ec4899','#6366f1']

// Tailwind text-color classes matching PIE_COLORS (used for tooltip, avoids inline styles)
const TOOLTIP_CLR: Record<string, string> = {
  'Spend':    'text-blue-400',
  'Core Hrs': 'text-amber-400',
}

const RANGE_OPTS: { label: string; days: number }[] = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: '6M',  days: 180 },
  { label: 'All', days: 0   },
]

// ─────────────────────────── helpers ─────────────────────────────────────────
function fmtMoney(n: number) { return `$${n.toFixed(2)}` }
function fmtNum(n: number)   { return n.toLocaleString() }

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function getIsAdmin(): boolean {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (!token) return false
    return Boolean(JSON.parse(atob(token.split('.')[1]))?.isAdmin)
  } catch { return false }
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(iso))
}

// ─────────────────────────── types ───────────────────────────────────────────
interface Summary {
  totalCost: number
  totalCoreHours: number
  totalJobs: number
  framesRendered: number
  avgCostPerJob: number
}

interface TimePoint { date: string; accountSpend: number; coreHours: number }
interface ProjectItem { name: string; spend: number; jobs: number }
interface InstanceItem { type: string; spend: number; jobs: number }
interface UserItem { email: string; jobs: number; spend: number; coreHours: number }
interface MonthItem { month: string; label: string; spend: number; jobs: number }
interface JobItem {
  id: number; jobNumber: string; title: string; project: string
  date: string; coreHours: number; gpuHours: number; total: number
}

// ─────────────────────────── sub-components ──────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="usage-summary-card">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SpendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="usage-tooltip">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} className={`text-xs leading-5 ${TOOLTIP_CLR[p.name] ?? 'text-gray-300'}`}>
          {p.name}: <strong>{p.name === 'Spend' ? fmtMoney(p.value) : p.value.toFixed(2)}</strong>
        </p>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="usage-tooltip">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xs text-blue-400">Spend: <strong>{fmtMoney(payload[0]?.value ?? 0)}</strong></p>
      <p className="text-xs text-amber-400">Jobs: <strong>{payload[1]?.value ?? 0}</strong></p>
    </div>
  )
}

function SortTh({
  col, label, sort, order, onSort,
}: {
  col: string; label: string
  sort: string; order: 'asc' | 'desc'
  onSort: (col: string) => void
}) {
  return (
    <th className="jobs-th cursor-pointer select-none" onClick={() => onSort(col)}>
      {label}
      {sort === col && <span className="ml-1 text-blue-400">{order === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

// ─────────────────────────── page ────────────────────────────────────────────
export default function UsagePage() {
  // ── filter state ──────────────────────────────────────────────────────────
  const [rangeDays, setRangeDays] = useState(30)
  const [projectId, setProjectId] = useState('')

  // ── ui ────────────────────────────────────────────────────────────────────
  const [isAdmin, setIsAdmin]       = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  // ── data ──────────────────────────────────────────────────────────────────
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [timeseries, setTimeseries] = useState<TimePoint[]>([])
  const [byProject,  setByProject]  = useState<ProjectItem[]>([])
  const [byInstance, setByInstance] = useState<InstanceItem[]>([])
  const [byUser,     setByUser]     = useState<UserItem[]>([])
  const [monthComp,  setMonthComp]  = useState<MonthItem[]>([])

  // ── jobs table ────────────────────────────────────────────────────────────
  const [jobs,        setJobs]       = useState<JobItem[]>([])
  const [jobTotal,    setJobTotal]   = useState(0)
  const [jobPages,    setJobPages]   = useState(1)
  const [jobPage,     setJobPage]    = useState(1)
  const [jobSort,     setJobSort]    = useState('date')
  const [jobOrder,    setJobOrder]   = useState<'asc'|'desc'>('desc')
  const [jobsLoading, setJobsLoading] = useState(false)

  // ── loading ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)

  // ── projects list (for filter) ────────────────────────────────────────────
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([])

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => { setIsAdmin(getIsAdmin()) }, [])

  useEffect(() => {
    const h = authHeaders()
    fetch('/api/projects', { headers: h })
      .then(r => r.json())
      .then(d => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // ── main data fetch ───────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const h = authHeaders()
    const qs = `range=${rangeDays}${projectId ? `&projectId=${projectId}` : ''}`

    try {
      const [sumRes, tsRes, projRes, instRes, monthRes] = await Promise.all([
        fetch(`/api/usage?${qs}`,              { headers: h }),
        fetch(`/api/usage/chart?${qs}`,        { headers: h }),
        fetch(`/api/usage/by-project?${qs}`,   { headers: h }),
        fetch(`/api/usage/by-instance?${qs}`,  { headers: h }),
        fetch(`/api/usage/month-comparison`,   { headers: h }),
      ])

      const [sumData, tsData, projData, instData, monthData] = await Promise.all([
        sumRes.json(), tsRes.json(), projRes.json(), instRes.json(), monthRes.json(),
      ])

      setSummary(sumData.summary ?? null)
      setTimeseries(Array.isArray(tsData) ? tsData : [])
      setByProject(Array.isArray(projData) ? projData : [])
      setByInstance(Array.isArray(instData) ? instData : [])
      setMonthComp(Array.isArray(monthData) ? monthData : [])
      setLastRefresh(new Date())
    } catch {/* network error — keep stale data */}

    setLoading(false)
  }, [rangeDays, projectId])

  // admin by-user fetch (separate so it doesn't block main render)
  const fetchByUser = useCallback(async () => {
    if (!isAdmin) return
    const h = authHeaders()
    const qs = `range=${rangeDays}`
    try {
      const res = await fetch(`/api/usage/by-user?${qs}`, { headers: h })
      const d = await res.json()
      setByUser(Array.isArray(d) ? d : [])
    } catch {/* ignore */}
  }, [isAdmin, rangeDays])

  // ── jobs fetch ────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    setJobsLoading(true)
    const h = authHeaders()
    const qs = [
      `range=${rangeDays}`,
      projectId ? `projectId=${projectId}` : '',
      `page=${jobPage}`,
      `sort=${jobSort}`,
      `order=${jobOrder}`,
    ].filter(Boolean).join('&')
    try {
      const res = await fetch(`/api/usage/jobs?${qs}`, { headers: h })
      const d   = await res.json()
      setJobs(Array.isArray(d.jobs) ? d.jobs : [])
      setJobTotal(d.total ?? 0)
      setJobPages(d.totalPages ?? 1)
    } catch {/* ignore */}
    setJobsLoading(false)
  }, [rangeDays, projectId, jobPage, jobSort, jobOrder])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchByUser() }, [fetchByUser])
  useEffect(() => { fetchJobs() }, [fetchJobs])

  // ── auto-refresh every 30 s ───────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { fetchAll(); fetchByUser(); fetchJobs() }, 30_000)
    return () => clearInterval(id)
  }, [fetchAll, fetchByUser, fetchJobs])

  // ── sort handler ──────────────────────────────────────────────────────────
  function handleSort(col: string) {
    if (jobSort === col) setJobOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setJobSort(col); setJobOrder('desc') }
    setJobPage(1)
  }

  // ── export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const cols = ['Date','Job ID','Project','Title','Core Hrs','GPU Hrs','Total']
    const dataRows = jobs.map(j => [
      j.date, j.jobNumber, j.project, `"${j.title.replace(/"/g, '""')}"`,
      j.coreHours.toFixed(2), j.gpuHours.toFixed(2), j.total.toFixed(2),
    ])
    const csv = [cols, ...dataRows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href: url, download: `usage-${rangeDays}d.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── derived values ────────────────────────────────────────────────────────
  const totalSpend     = summary?.totalCost      ?? 0
  const coreHours      = summary?.totalCoreHours  ?? 0
  const jobsCompleted  = summary?.totalJobs       ?? 0
  const framesRendered = summary?.framesRendered   ?? 0

  // ─────────────────────────── render ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-gray-500">Cost analytics &amp; compute consumption</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="usage-live-dot" />
          Live · refreshed {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="usage-filter-bar">
        <div className="flex items-center gap-1">
          {RANGE_OPTS.map(opt => (
            <button type="button" key={opt.label}
              className={`usage-range-btn${rangeDays === opt.days ? ' usage-range-btn--active' : ''}`}
              onClick={() => { setRangeDays(opt.days); setJobPage(1) }}>
              {opt.label}
            </button>
          ))}
        </div>

        <select title="Filter by project" value={projectId}
          onChange={e => { setProjectId(e.target.value); setJobPage(1) }}
          className="usage-control-select">
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <button type="button" onClick={exportCSV} className="usage-export-btn ml-auto">
          ↓ Export CSV
        </button>
      </div>

      {/* ── Metric cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Spend"     value={loading ? '—' : fmtMoney(totalSpend)}        sub="this period" />
        <MetricCard label="Core Hours"      value={loading ? '—' : coreHours.toFixed(1)}         sub="CPU core-hours" />
        <MetricCard label="Jobs Completed"  value={loading ? '—' : fmtNum(jobsCompleted)}        sub="render jobs" />
        <MetricCard label="Frames Rendered" value={loading ? '—' : fmtNum(framesRendered)}       sub="total frames" />
      </div>

      {/* ── Spend over time (AreaChart) ─────────────────────────────────────── */}
      <div className="usage-chart-card">
        <h3 className="usage-chart-title">Spend Over Time</h3>
        {!loading && timeseries.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={timeseries} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
                <linearGradient id="coresGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} />
              <YAxis yAxisId="left"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} width={52} />
              <YAxis yAxisId="right" orientation="right"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} width={40} />
              <RCTooltip content={<SpendTooltip />} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12, paddingTop: 8 }} />
              <Area yAxisId="left" type="monotone" dataKey="accountSpend"
                name="Spend" stroke="#3b82f6" fill="url(#spendGrad)"
                strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Area yAxisId="right" type="monotone" dataKey="coreHours"
                name="Core Hrs" stroke="#f59e0b" fill="url(#coresGrad)"
                strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Breakdown charts (donut + bar) ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Spend by Project — Donut */}
        <div className="usage-chart-card">
          <h3 className="usage-chart-title">Spend by Project</h3>
          {!loading && byProject.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No project data.</p>
          ) : (
            <div className="flex items-center gap-5 flex-wrap">
              <div className="usage-donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProject} dataKey="spend" nameKey="name"
                      cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                      strokeWidth={0} paddingAngle={2}>
                      {byProject.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RCTooltip
                      formatter={(v: unknown, name: unknown) => [fmtMoney(Number(v)), String(name)]}
                      contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#9ca3af' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex flex-col gap-2 text-xs flex-1 min-w-0">
                {byProject.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2 min-w-0">
                    <span className={`usage-pie-swatch usage-pie-swatch-${i % PIE_COLORS.length}`} />
                    <span className="text-gray-300 truncate flex-1">{p.name}</span>
                    <span className="text-gray-500 mr-2">{p.jobs}j</span>
                    <span className="text-white font-mono">{fmtMoney(p.spend)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Spend by Instance — Horizontal bar */}
        <div className="usage-chart-card">
          <h3 className="usage-chart-title">Spend by Instance Type</h3>
          {!loading && byInstance.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No instance data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, byInstance.length * 40)}>
              <BarChart data={byInstance} layout="vertical"
                margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"
                  horizontal={false} />
                <XAxis type="number"
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" width={110}
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <RCTooltip
                  formatter={(v: unknown) => [fmtMoney(Number(v)), 'Spend']}
                  contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#9ca3af' }} />
                <Bar dataKey="spend" name="Spend" radius={[0, 4, 4, 0]}>
                  {byInstance.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                  <LabelList dataKey="spend" position="right"
                    formatter={(v: unknown) => Number(v) > 0 ? fmtMoney(Number(v)) : ''}
                    style={{ fill: '#9ca3af', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Admin: Spend by User ────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="calc-card p-0 overflow-hidden">
          <div className="px-5 py-4 usage-section-header">
            <h3 className="text-sm font-semibold text-gray-200">Spend by User</h3>
            <span className="text-xs text-gray-500">Admin view</span>
          </div>
          {byUser.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No user data for this period.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="jobs-thead-row">
                  {['USER','JOBS','CORE HRS','TOTAL SPEND'].map(h => (
                    <th key={h} className="jobs-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byUser.map(u => (
                  <tr key={u.email} className="jobs-tbody-row">
                    <td className="jobs-td text-gray-300">{u.email}</td>
                    <td className="jobs-td text-right text-gray-400">{u.jobs}</td>
                    <td className="jobs-td text-right font-mono text-gray-300">{u.coreHours.toFixed(1)}</td>
                    <td className="jobs-td text-right font-mono font-semibold text-white">{fmtMoney(u.spend)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="usage-table-foot-row">
                  <td className="jobs-td text-xs text-gray-500 font-semibold uppercase tracking-wider" colSpan={2}>Total</td>
                  <td className="jobs-td text-right font-mono font-semibold text-gray-200">
                    {byUser.reduce((s, u) => s + u.coreHours, 0).toFixed(1)}
                  </td>
                  <td className="jobs-td text-right font-mono font-bold text-blue-400">
                    {fmtMoney(byUser.reduce((s, u) => s + u.spend, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Month-over-month BarChart ───────────────────────────────────────── */}
      <div className="usage-chart-card">
        <h3 className="usage-chart-title">Monthly Spend — Last 12 Months</h3>
        {monthComp.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">No monthly data.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthComp} margin={{ top: 16, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} />
              <YAxis yAxisId="spend"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} width={50} />
              <YAxis yAxisId="jobs" orientation="right"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false} tickLine={false} width={35} />
              <RCTooltip content={<MonthTooltip />} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12, paddingTop: 6 }} />
              <Bar yAxisId="spend" dataKey="spend" name="Spend ($)" fill="#3b82f6" radius={[3,3,0,0]}>
                <LabelList dataKey="spend" position="top"
                  formatter={(v: unknown) => Number(v) > 0 ? `$${Number(v).toFixed(0)}` : ''}
                  style={{ fill: '#6b7280', fontSize: 9 }} />
              </Bar>
              <Bar yAxisId="jobs" dataKey="jobs" name="Jobs" fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Job Cost Table ─────────────────────────────────────────────────── */}
      <div className="calc-card p-0 overflow-hidden">
        <div className="px-5 py-4 usage-section-header flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">
            Job Breakdown
            {jobTotal > 0 && (
              <span className="ml-2 text-xs text-gray-500 font-normal">
                ({fmtNum(jobTotal)} jobs)
              </span>
            )}
          </h3>
          <button type="button" onClick={exportCSV} className="usage-export-btn text-xs">
            ↓ Export CSV
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                <SortTh col="date"  label="DATE"     sort={jobSort} order={jobOrder} onSort={handleSort} />
                <SortTh col="job"   label="JOB ID"   sort={jobSort} order={jobOrder} onSort={handleSort} />
                <th className="jobs-th">PROJECT</th>
                <th className="jobs-th">TITLE</th>
                <SortTh col="cores" label="CORE HRS" sort={jobSort} order={jobOrder} onSort={handleSort} />
                <th className="jobs-th">GPU HRS</th>
                <SortTh col="cost"  label="TOTAL"    sort={jobSort} order={jobOrder} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {jobsLoading ? (
                <tr>
                  <td colSpan={7} className="jobs-td text-center text-gray-500 py-10">Loading…</td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="jobs-td text-center text-gray-500 py-10">
                    No completed jobs found for this period.
                  </td>
                </tr>
              ) : jobs.map(j => (
                <tr key={j.id} className="jobs-tbody-row">
                  <td className="jobs-td">
                    <time dateTime={j.date} className="font-mono text-xs text-gray-400">
                      {fmtDate(j.date)}
                    </time>
                  </td>
                  <td className="jobs-td">
                    <a href={`/jobs/${j.jobNumber}`} className="font-mono text-blue-400 hover:underline">
                      {j.jobNumber}
                    </a>
                  </td>
                  <td className="jobs-td text-gray-300">{j.project}</td>
                  <td className="jobs-td text-gray-400 max-w-[200px] truncate" title={j.title}>
                    {j.title}
                  </td>
                  <td className="jobs-td text-right font-mono text-gray-300">{j.coreHours.toFixed(1)}</td>
                  <td className="jobs-td text-right font-mono text-gray-300">{j.gpuHours.toFixed(1)}</td>
                  <td className="jobs-td text-right font-mono font-semibold text-white">{fmtMoney(j.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="usage-table-foot-row">
                <td colSpan={4} className="jobs-td">
                  <div className="flex items-center gap-2">
                    <button type="button"
                      onClick={() => setJobPage(p => Math.max(1, p - 1))}
                      disabled={jobPage === 1}
                      className="usage-page-btn disabled:opacity-40 disabled:cursor-not-allowed">
                      ← Prev
                    </button>
                    <span className="text-xs text-gray-500">
                      Page {jobPage} of {jobPages}
                    </span>
                    <button type="button"
                      onClick={() => setJobPage(p => Math.min(jobPages, p + 1))}
                      disabled={jobPage >= jobPages}
                      className="usage-page-btn disabled:opacity-40 disabled:cursor-not-allowed">
                      Next →
                    </button>
                  </div>
                </td>
                <td className="jobs-td text-right font-mono font-semibold text-gray-200">
                  {jobs.reduce((s, j) => s + j.coreHours, 0).toFixed(1)}
                </td>
                <td className="jobs-td text-right font-mono font-semibold text-gray-200">
                  {jobs.reduce((s, j) => s + j.gpuHours, 0).toFixed(1)}
                </td>
                <td className="jobs-td text-right font-mono font-bold text-blue-400 text-base">
                  {fmtMoney(jobs.reduce((s, j) => s + j.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

    </div>
  )
}
