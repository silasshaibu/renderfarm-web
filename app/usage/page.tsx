'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usage as usageApi, projects as projectsApi } from '@/lib/api'
import type { UsageRecord } from '@/lib/api'
import { useApiFetch } from '@/hooks/useApiFetch'

const UsageChart = dynamic(() => import('@/components/UsageChart'), { ssr: false })

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------
function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="usage-summary-card">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Range → days
// ---------------------------------------------------------------------------
const RANGES = ['Last 7 days', 'Last 30 days', 'Last 3 months', 'Last 6 months', 'All time'] as const

function rangeToDays(r: string): number | undefined {
  switch (r) {
    case 'Last 7 days':   return 7
    case 'Last 30 days':  return 30
    case 'Last 3 months': return 90
    case 'Last 6 months': return 180
    default:              return undefined // All time
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function UsagePage() {
  const [range,        setRange]        = useState<string>('Last 30 days')
  const [timePeriod,   setTimePeriod]   = useState('Today')
  const [customStart,  setCustomStart]  = useState('')
  const [customEnd,    setCustomEnd]    = useState('')
  const [showFor,      setShowFor]      = useState('Account')
  const [selectedProj, setSelectedProj] = useState('')

  const days      = rangeToDays(range)
  const projectId = showFor === 'Project' && selectedProj ? selectedProj : undefined

  // Fetch usage data (re-runs when range or project changes)
  const { data: usageData, loading } = useApiFetch(
    () => usageApi.get(days, projectId),
    [days, projectId]
  )

  // Fetch project list for dropdown
  const { data: projectList } = useApiFetch(() => projectsApi.list())

  const records: UsageRecord[] = usageData?.records ?? []
  const summary                = usageData?.summary
  const totalCost      = summary?.totalCost      ?? 0
  const totalCoreHours = summary?.totalCoreHours ?? 0
  const totalJobs      = summary?.totalJobs      ?? 0
  const avgCostPerJob  = summary?.avgCostPerJob  ?? 0

  const activeProjects   = (projectList ?? []).filter((p) => p.isActive)
  const archivedProjects = (projectList ?? []).filter((p) => !p.isActive)

  return (
    <div className="flex flex-col gap-6">
      {/* Heading + range */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-gray-500">Billing &amp; compute consumption</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Range:</span>
          <select title="Date range" value={range} onChange={(e) => setRange(e.target.value)}
            className="calc-input px-3 py-1.5 text-sm">
            {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Spend"    value={loading ? '—' : `$${totalCost.toFixed(2)}`}                           sub="this period"    />
        <SummaryCard label="Core Hours"     value={loading ? '—' : totalCoreHours.toFixed(1)}                             sub="CPU core-hours" />
        <SummaryCard label="Jobs Completed" value={loading ? '—' : String(totalJobs)}                                    sub="render jobs"    />
        <SummaryCard label="Avg Cost / Job" value={loading ? '—' : totalJobs > 0 ? `$${avgCostPerJob.toFixed(2)}` : '$0.00'} sub="per job"   />
      </div>

      {/* Chart + controls + breakdown */}
      <div className="usage-chart-card">
        <UsageChart title={`Silas Usage — ${new Date().toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' })}`} />

        {/* Controls row */}
        <div className="flex items-center gap-8 flex-wrap mt-6 pt-5 border-t border-white/5">
          <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap">
            <span>Show usage for:</span>
            <select title="Show usage for" className="usage-control-select" value={showFor}
              onChange={(e) => { setShowFor(e.target.value); setSelectedProj('') }}>
              <option>Account</option>
              <option>Project</option>
              <option>Metadata</option>
            </select>

            {showFor === 'Project' && (
              <select title="Select project" className="usage-control-select" value={selectedProj}
                onChange={(e) => setSelectedProj(e.target.value)}>
                <option value="">All Projects</option>
                <optgroup label="Active">
                  {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
                <optgroup label="Archived">
                  {archivedProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </optgroup>
              </select>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" defaultChecked className="accent-blue-500 w-4 h-4" />
            Accumulate Costs
          </label>

          <div className="flex flex-col gap-2 text-sm text-gray-300 ml-auto">
            <div className="flex items-center gap-2">
              <span>Time period:</span>
              <select title="Time period" className="usage-control-select" value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}>
                <option>Today</option>
                <option>Yesterday</option>
                <option>Month-to-Date</option>
                <option>Custom</option>
              </select>
            </div>

            {timePeriod === 'Custom' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-10 text-right text-gray-400">Start:</span>
                  <input type="date" title="Start date" value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)} className="usage-date-input" />
                  <button type="button" className="usage-go-btn">Go!</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 text-right text-gray-400">End:</span>
                  <input type="date" title="End date" value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)} className="usage-date-input" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instance Type table */}
        <div className="mt-6">
          <table className="usage-breakdown-table">
            <thead><tr><th>Instance Type</th><th>Usage in mins</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td>Instance Total:</td><td></td><td>$0.00</td></tr>
            </tbody>
          </table>
        </div>

        {/* Storage Type table */}
        <div className="mt-4">
          <table className="usage-breakdown-table">
            <thead><tr><th>Storage Type</th><th>Price</th><th>Used</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="usage-breakdown-empty">No storage usage this period.</td></tr>
            </tbody>
          </table>
        </div>

        {/* Grand Total */}
        <div className="usage-grand-total-row">
          <span className="font-bold text-white text-sm">Grand Total</span>
          <span className="font-bold text-white text-sm ml-auto">${totalCost.toFixed(2)}</span>
        </div>
      </div>

      {/* Job Breakdown table */}
      <div className="calc-card p-0 overflow-hidden">
        <div className="px-5 py-4 usage-section-header">
          <h3 className="text-sm font-semibold text-gray-200">Job Breakdown</h3>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['DATE','JOB ID','PROJECT','TITLE','CORE HRS','GPU HRS','LICENSES','TOTAL'].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="jobs-td text-center text-gray-500 py-6">Loading…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={8} className="jobs-td text-center text-gray-500 py-6">No jobs found for this range.</td></tr>
              ) : records.map((row) => (
                <tr key={row.id} className="jobs-tbody-row">
                  <td className="jobs-td">
                    <time dateTime={row.date} className="font-mono text-xs text-gray-400">
                      {new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(row.date))}
                    </time>
                  </td>
                  <td className="jobs-td">
                    <a href={`/jobs/${row.job.jobNumber}`} className="font-mono text-blue-400 hover:underline">{row.job.jobNumber}</a>
                  </td>
                  <td className="jobs-td text-gray-300">{row.job.project.name}</td>
                  <td className="jobs-td text-gray-400 max-w-[220px] truncate">{row.job.title}</td>
                  <td className="jobs-td text-right font-mono text-gray-300">{row.coreHours.toFixed(1)}</td>
                  <td className="jobs-td text-right font-mono text-gray-300">{row.gpuHours.toFixed(1)}</td>
                  <td className="jobs-td text-right font-mono text-gray-300">${row.licenseFee.toFixed(2)}</td>
                  <td className="jobs-td text-right font-mono font-semibold text-white">${row.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="usage-table-foot-row">
                <td colSpan={4} className="jobs-td text-right text-xs text-gray-500 font-semibold uppercase tracking-wider">Total</td>
                <td className="jobs-td text-right font-mono font-semibold text-gray-200">{totalCoreHours.toFixed(1)}</td>
                <td className="jobs-td text-right font-mono font-semibold text-gray-200">
                  {records.reduce((s, r) => s + r.gpuHours, 0).toFixed(1)}
                </td>
                <td className="jobs-td text-right font-mono font-semibold text-gray-200">
                  ${records.reduce((s, r) => s + r.licenseFee, 0).toFixed(2)}
                </td>
                <td className="jobs-td text-right font-mono font-bold text-blue-400 text-base">
                  ${totalCost.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
