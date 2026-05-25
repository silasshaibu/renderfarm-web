'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: () => void; id: string }) {
  return (
    <label htmlFor={id} className="relative inline-flex items-center cursor-pointer gap-2">
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <div className={`enterprise-toggle-track${checked ? ' enterprise-toggle-track-on' : ''}`} />
      <div className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      <span className={`text-xs font-medium ${checked ? 'enterprise-toggle-label-on' : 'enterprise-toggle-label-off'}`}>
        {checked ? 'On' : 'Off'}
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Wrangler card
// ---------------------------------------------------------------------------
function WranglerCard({ title, enabled, onToggle, toggleId, badge, children }: {
  title: string; enabled: boolean; onToggle: () => void
  toggleId: string; badge?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="wrangler-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          {badge}
        </div>
        <Toggle id={toggleId} checked={enabled} onChange={onToggle} />
      </div>
      <div className={`flex flex-col gap-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        {children}
      </div>
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

function InlineInput({ id, value, onChange, unit, type = 'number' }: {
  id: string; value: string; onChange: (v: string) => void; unit: string; type?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input id={id} type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="calc-input px-3 py-1.5 w-24 text-right" />
      <span className="text-xs text-gray-500">{unit}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------
function SettingsTab() {
  // Max Frame/Task Runtime
  const [maxRuntimeOn,  setMaxRuntimeOn]  = useState(true)
  const [maxRuntime,    setMaxRuntime]     = useState('1')
  const [runtimeAction, setRuntimeAction] = useState('Kill')

  // Resource Exhaustion – Spot to On-Demand
  const [spotOn,  setSpotOn]  = useState(false)   // shows "Unavailable"

  // Resource Exhaustion – Zone Relocation
  const [zoneOn,        setZoneOn]        = useState(true)
  const [maxWait,       setMaxWait]       = useState('90')
  const [priorityLevel, setPriorityLevel] = useState('5')

  // Outlier Frames
  const [outlierOn,   setOutlierOn]   = useState(true)
  const [checkFreq,   setCheckFreq]   = useState('5')

  const [saved,  setSaved]  = useState(false)
  const [saving, setSaving] = useState(false)

  // Load settings from API on mount
  const load = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res   = await fetch('/api/wrangler-settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const s = await res.json() as Record<string, unknown>
      if (s.maxRuntimeOn  !== undefined) setMaxRuntimeOn(Boolean(s.maxRuntimeOn))
      if (s.maxRuntime    !== undefined) setMaxRuntime(String(s.maxRuntime))
      if (s.runtimeAction !== undefined) setRuntimeAction(String(s.runtimeAction))
      if (s.spotOn        !== undefined) setSpotOn(Boolean(s.spotOn))
      if (s.zoneOn        !== undefined) setZoneOn(Boolean(s.zoneOn))
      if (s.maxWait       !== undefined) setMaxWait(String(s.maxWait))
      if (s.priorityLevel !== undefined) setPriorityLevel(String(s.priorityLevel))
      if (s.outlierOn     !== undefined) setOutlierOn(Boolean(s.outlierOn))
      if (s.checkFreq     !== undefined) setCheckFreq(String(s.checkFreq))
    } catch { /* ignore — settings are optional */ }
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      await fetch('/api/wrangler-settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          maxRuntimeOn, maxRuntime, runtimeAction,
          spotOn, zoneOn, maxWait, priorityLevel,
          outlierOn, checkFreq,
        }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const UnavailableBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold wrangler-unavailable-badge">
      Unavailable
    </span>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-400">
        Virtual Wranglers allow you to set parameters to oversee and manage the function of your jobs
        on Conductor. These settings are for the entire account and will affect{' '}
        <span className="text-gray-200 font-medium">all</span> jobs run in the account.
      </p>

      {saved && (
        <div className="enterprise-alert-success">
          ✓ Virtual Wrangler settings saved
        </div>
      )}

      {/* Max Frame/Task Runtime */}
      <WranglerCard title="Max Frame/Task Runtime" enabled={maxRuntimeOn}
        onToggle={() => setMaxRuntimeOn((v) => !v)} toggleId="max-runtime-toggle">
        <p className="text-xs text-gray-500">
          The &quot;Max Frame/Task Runtime&quot; virtual wrangler will retry or automatically kill any
          tasks that run longer than your set maximum runtime.
        </p>
        <FieldRow label="Max Runtime" hint="Set how long a task can run before an action is taken. The minimum wait time is 1 hour.">
          <InlineInput id="max-runtime" value={maxRuntime} onChange={setMaxRuntime} unit="hours" />
        </FieldRow>
        <FieldRow label="Runtime Exceeded Action" hint="Select the action to take when the runtime is exceeded.">
          <select id="runtime-action" title="Runtime exceeded action" value={runtimeAction}
            onChange={(e) => setRuntimeAction(e.target.value)}
            className="calc-input px-3 py-1.5 w-40">
            <option value="Kill">Kill</option>
            <option value="Retry">Retry</option>
            <option value="Notify">Notify</option>
          </select>
        </FieldRow>
      </WranglerCard>

      {/* Resource Exhaustion Avoidance */}
      <div className="wrangler-card">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Resource Exhaustion Avoidance</h3>
        <p className="text-xs text-gray-500 mb-4">
          Occasionally resource zones will run out of capacity before a job is fully provisioned.
          &quot;Spot to On-Demand&quot; and &quot;Zone Relocation&quot; are two wranglers that let you define
          what actions to take to avoid your job being delayed due to resource exhaustion.
        </p>

        {/* Spot to On-Demand sub-card */}
        <div className="wrangler-sub-card mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-300">Spot to On-Demand</p>
              {UnavailableBadge}
            </div>
            <Toggle id="spot-toggle" checked={spotOn} onChange={() => setSpotOn((v) => !v)} />
          </div>
          <p className="text-xs text-gray-500">
            If cheaper pre-emptible (spot) instances aren&apos;t immediately available, tasks can
            take longer to get resources and transition from PENDING to RUNNING. The &quot;Spot to
            On-Demand&quot; virtual wrangler will automatically switch your high-priority jobs to
            standard instances to get quicker resource placement.{' '}
            <span className="text-gray-300 font-medium">Current cloud provider does not support this wrangler.</span>
          </p>
        </div>

        {/* Zone Relocation sub-card */}
        <div className="wrangler-sub-card">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-300">Zone Relocation</p>
            <Toggle id="zone-toggle" checked={zoneOn} onChange={() => setZoneOn((v) => !v)} />
          </div>
          <p className="text-xs text-gray-500 mb-4">
            The &quot;Zone Relocation&quot; virtual wrangler automatically moves your job to a
            different resource zone if it has been waiting longer than a set time for
            resources to become available.
          </p>
          <div className={`flex flex-col gap-4 ${!zoneOn ? 'opacity-50 pointer-events-none' : ''}`}>
            <FieldRow label="Max Wait Time" hint="Set how long to wait before moving your job. The minimum wait time is 90 minutes.">
              <InlineInput id="max-wait" value={maxWait} onChange={setMaxWait} unit="minutes" />
            </FieldRow>
            <FieldRow label="Priority Level" hint="All jobs at or above the set priority level will be managed by this wrangler.">
              <InlineInput id="priority-level" value={priorityLevel} onChange={setPriorityLevel} unit="" />
            </FieldRow>
          </div>
        </div>
      </div>

      {/* Outlier Frames */}
      <WranglerCard title="Outlier Frames" enabled={outlierOn}
        onToggle={() => setOutlierOn((v) => !v)} toggleId="outlier-toggle">
        <p className="text-xs text-gray-500">
          The &quot;Outlier&quot; virtual wrangler will help you identify tasks that aren&apos;t behaving as
          expected by emailing the user who submitted the job of any frames that are taking
          longer than other tasks in the job. Only jobs that contain 3 or more tasks will be
          analyzed.
        </p>
        <FieldRow label="Check Frequency" hint="Set how often running jobs will be checked for outliers, with a max frequency of 5 minutes.">
          <InlineInput id="check-freq" value={checkFreq} onChange={setCheckFreq} unit="minutes" />
        </FieldRow>
      </WranglerCard>

      {/* Save button row */}
      <div className="flex justify-end pt-2 wrangler-save-row">
        <button type="button" className="admin-btn-primary px-6 py-2 text-sm"
          disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// History Tab — live data from /api/wrangler-events
// ---------------------------------------------------------------------------
interface WranglerEvent {
  id:        string
  ts:        string
  wrangler:  string
  jobNumber: string
  action:    string
  detail:    string
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso))
}

function HistoryTab() {
  const [events,  setEvents]  = useState<WranglerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''

    fetch('/api/wrangler-events', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: WranglerEvent[]) => {
        if (mountedRef.current) { setEvents(Array.isArray(data) ? data : []); setLoading(false) }
      })
      .catch((e: unknown) => {
        if (mountedRef.current) {
          setError(e instanceof Error ? e.message : 'Failed to load events')
          setLoading(false)
        }
      })

    return () => { mountedRef.current = false }
  }, [])

  if (loading) return <p className="px-4 py-10 text-center text-gray-600 text-sm">Loading…</p>
  if (error)   return <p className="px-4 py-10 text-center text-red-500 text-sm">{error}</p>

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="jobs-thead-row">
            {['TIMESTAMP','WRANGLER','JOB ID','ACTION','DETAIL'].map((h) => (
              <th key={h} className="jobs-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-gray-600 text-sm">
                No wrangler events yet. Events appear here when the worker enforces runtime limits or handles GPU holds.
              </td>
            </tr>
          ) : (
            events.map((e) => (
              <tr key={e.id} className="jobs-tbody-row">
                <td className="jobs-td font-mono text-xs text-gray-500">{fmt(e.ts)}</td>
                <td className="jobs-td text-gray-300">{e.wrangler}</td>
                <td className="jobs-td">
                  <a href={`/jobs/${e.jobNumber}`} className="font-mono text-blue-400 hover:underline">
                    {e.jobNumber}
                  </a>
                </td>
                <td className="jobs-td">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-400/10 text-yellow-400 border border-yellow-400/25">
                    {e.action}
                  </span>
                </td>
                <td className="jobs-td text-xs text-gray-500">{e.detail}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'settings', label: 'Settings', panel: <SettingsTab /> },
  { id: 'history',  label: 'History',  panel: <HistoryTab />  },
] as const
type TabId = (typeof TABS)[number]['id']

export default function VirtualWranglerPage() {
  const [active, setActive] = useState<TabId>('settings')
  const currentPanel = TABS.find((t) => t.id === active)?.panel

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Virtual Wrangler</h1>
      </div>
      <div className="admin-tabbar">
        {TABS.map((tab) => (
          <button key={tab.id} type="button"
            onClick={() => setActive(tab.id)}
            className={['admin-tab', active === tab.id ? 'admin-tab--active' : ''].join(' ')}>
            {tab.label}
          </button>
        ))}
      </div>
      {currentPanel}
    </div>
  )
}
