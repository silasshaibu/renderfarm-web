'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── helpers ──────────────────────────────────────────────────────────────────

function tok() {
  return typeof window !== 'undefined' ? (localStorage.getItem('rf_token') ?? '') : ''
}

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}`, ...(opts.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(new Date(iso))
}

// ─── shared UI ───────────────────────────────────────────────────────────────

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

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-gray-400">{label}</p>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

function NumInput({ id, value, onChange, min = 1 }: {
  id: string; value: number; onChange: (v: number) => void; min?: number
}) {
  return (
    <input id={id} type="number" min={min} value={value}
      onChange={e => onChange(Math.max(min, Number(e.target.value) || min))}
      className="calc-input px-3 py-1.5 w-28 text-right" />
  )
}

function SavedBanner() {
  return (
    <div className="enterprise-alert-success text-sm">✓ Settings saved</div>
  )
}

function ConfirmModal({ message, onConfirm, onCancel, busy }: {
  message: string; onConfirm: () => void; onCancel: () => void; busy: boolean
}) {
  return (
    <div className="enterprise-modal-overlay" onClick={onCancel}>
      <div className="admin-confirm-card" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-gray-300 mb-5">{message}</p>
        <div className="admin-confirm-actions">
          <button type="button" className="admin-btn-ghost px-4 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="admin-confirm-remove-btn px-4 py-2 text-sm"
            disabled={busy} onClick={onConfirm}>
            {busy ? 'Clearing…' : 'Clear Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── WranglerCard ─────────────────────────────────────────────────────────────

function WranglerCard({ title, description, enabled, onToggle, toggleId, saving, saved, onSave, children }: {
  title: string; description: string; enabled: boolean; onToggle: () => void
  toggleId: string; saving: boolean; saved: boolean; onSave: () => void
  children: React.ReactNode
}) {
  return (
    <div className="wrangler-card flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <Toggle id={toggleId} checked={enabled} onChange={onToggle} />
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500">{description}</p>

      {/* Saved banner */}
      {saved && <SavedBanner />}

      {/* Config fields — dimmed when disabled */}
      <div className={`flex flex-col gap-4 ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        {children}
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2 wrangler-save-row">
        <button type="button" className="admin-btn-primary px-5 py-1.5 text-sm"
          disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── Max Frame/Task Runtime ───────────────────────────────────────────────────

function MaxRuntimeCard({ init }: { init: Record<string, unknown> }) {
  const [enabled, setEnabled]  = useState(Boolean(init.enabled) ?? true)
  const [maxHours, setMaxHours] = useState(Number(init.max_hours ?? 1))
  const [action,  setAction]   = useState(String(init.action ?? 'kill'))
  const [saving,  setSaving]   = useState(false)
  const [saved,   setSaved]    = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/virtual-wrangler/max-runtime', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, max_hours: maxHours, action }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <WranglerCard
      title="Max Frame/Task Runtime"
      description='The "Max Frame/Task Runtime" virtual wrangler will retry or automatically kill any tasks that run longer than your set maximum runtime.'
      enabled={enabled} onToggle={() => setEnabled(v => !v)} toggleId="max-runtime-toggle"
      saving={saving} saved={saved} onSave={save}>

      <FieldRow label="Max Runtime" hint="Set how long a task can run before an action is taken. Minimum 1 hour.">
        <div className="flex items-center gap-2">
          <NumInput id="max-hours" value={maxHours} onChange={setMaxHours} min={1} />
          <span className="text-xs text-gray-500">hours</span>
        </div>
      </FieldRow>

      <FieldRow label="Runtime Exceeded Action" hint="Select the action to take when the runtime is exceeded.">
        <select id="runtime-action" title="Runtime exceeded action" value={action}
          onChange={e => setAction(e.target.value)}
          className="calc-input px-3 py-1.5 w-40">
          <option value="kill">Kill</option>
          <option value="retry">Retry</option>
          <option value="notify">Notify</option>
        </select>
      </FieldRow>
    </WranglerCard>
  )
}

// ─── Zone Relocation ──────────────────────────────────────────────────────────

function RelocationCard({ init }: { init: Record<string, unknown> }) {
  const [enabled,   setEnabled]   = useState(Boolean(init.enabled) ?? true)
  const [maxWait,   setMaxWait]   = useState(Number(init.max_wait_minutes ?? 90))
  const [priority,  setPriority]  = useState(Number(init.priority_threshold ?? 5))
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/virtual-wrangler/relocation', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, max_wait_minutes: maxWait, priority_threshold: priority }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <WranglerCard
      title="Zone Relocation"
      description='The "Zone Relocation" virtual wrangler automatically moves your job to a different resource zone if it has been waiting longer than a set time for resources to become available.'
      enabled={enabled} onToggle={() => setEnabled(v => !v)} toggleId="relocation-toggle"
      saving={saving} saved={saved} onSave={save}>

      <FieldRow label="Max Wait Time" hint="Set how long to wait before moving your job. Minimum 90 minutes.">
        <div className="flex items-center gap-2">
          <NumInput id="max-wait" value={maxWait} onChange={setMaxWait} min={90} />
          <span className="text-xs text-gray-500">minutes</span>
        </div>
      </FieldRow>

      <FieldRow label="Priority Threshold" hint="All jobs at or above the set priority level will be managed by this wrangler.">
        <div className="flex items-center gap-2">
          <NumInput id="reloc-priority" value={priority} onChange={setPriority} min={1} />
          <span className="text-xs text-gray-500">and above</span>
        </div>
      </FieldRow>
    </WranglerCard>
  )
}

// ─── Spot to On-Demand ────────────────────────────────────────────────────────

function SpotToOnDemandCard({ init }: { init: Record<string, unknown> }) {
  const [enabled,  setEnabled]  = useState(Boolean(init.enabled) ?? false)
  const [waitMin,  setWaitMin]  = useState(Number(init.wait_minutes ?? 30))
  const [priority, setPriority] = useState(Number(init.priority_threshold ?? 7))
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/virtual-wrangler/spot-to-ondemand', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, wait_minutes: waitMin, priority_threshold: priority }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <WranglerCard
      title="Spot to On-Demand"
      description={"If cheaper pre-emptible (spot) instances aren't immediately available, tasks can take longer to get resources. The \"Spot to On-Demand\" wrangler automatically switches high-priority jobs to standard instances for quicker placement."}
      enabled={enabled} onToggle={() => setEnabled(v => !v)} toggleId="spot-toggle"
      saving={saving} saved={saved} onSave={save}>

      <FieldRow label="Wait Time" hint="How long to wait for a spot instance before switching to on-demand.">
        <div className="flex items-center gap-2">
          <NumInput id="spot-wait" value={waitMin} onChange={setWaitMin} min={1} />
          <span className="text-xs text-gray-500">minutes</span>
        </div>
      </FieldRow>

      <FieldRow label="Priority Threshold" hint="Only jobs at or above this priority level will be switched to on-demand.">
        <div className="flex items-center gap-2">
          <NumInput id="spot-priority" value={priority} onChange={setPriority} min={1} />
          <span className="text-xs text-gray-500">and above</span>
        </div>
      </FieldRow>
    </WranglerCard>
  )
}

// ─── Syncer ───────────────────────────────────────────────────────────────────

function SyncerCard({ init }: { init: Record<string, unknown> }) {
  const [enabled, setEnabled]   = useState(Boolean(init.enabled) ?? false)
  const [retries, setRetries]   = useState(Number(init.max_retries ?? 3))
  const [timeout, setTimeout_]  = useState(Number(init.timeout_minutes ?? 60))
  const [action,  setAction]    = useState(String(init.action ?? 'retry'))
  const [saving,  setSaving]    = useState(false)
  const [saved,   setSaved]     = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/virtual-wrangler/syncer', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, max_retries: retries, timeout_minutes: timeout, action }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  return (
    <WranglerCard
      title="Syncer"
      description='The "Syncer" wrangler manages file synchronization failures. When a sync operation fails it can retry, fail the task, or send an alert and retry based on your configured policy.'
      enabled={enabled} onToggle={() => setEnabled(v => !v)} toggleId="syncer-toggle"
      saving={saving} saved={saved} onSave={save}>

      <FieldRow label="Max Retries" hint="Maximum number of times to retry a failed sync before taking the fallback action.">
        <div className="flex items-center gap-2">
          <NumInput id="syncer-retries" value={retries} onChange={setRetries} min={1} />
          <span className="text-xs text-gray-500">retries</span>
        </div>
      </FieldRow>

      <FieldRow label="Sync Timeout" hint="How long to wait for a sync operation before marking it as failed.">
        <div className="flex items-center gap-2">
          <NumInput id="syncer-timeout" value={timeout} onChange={setTimeout_} min={1} />
          <span className="text-xs text-gray-500">minutes</span>
        </div>
      </FieldRow>

      <FieldRow label="On Failure Action" hint="What to do when the sync fails and all retries are exhausted.">
        <select id="syncer-action" title="Sync failure action" value={action}
          onChange={e => setAction(e.target.value)}
          className="calc-input px-3 py-1.5 w-44">
          <option value="retry">Retry</option>
          <option value="fail">Fail Task</option>
          <option value="alert_retry">Alert + Retry</option>
        </select>
      </FieldRow>
    </WranglerCard>
  )
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

interface WranglerEvent {
  id: string; ts: string; wrangler: string; jobNumber: string; action: string; detail: string
}

function ActivityLog() {
  const [events,       setEvents]      = useState<WranglerEvent[]>([])
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState('')
  const [showConfirm,  setShowConfirm] = useState(false)
  const [clearing,     setClearing]    = useState(false)
  const [lastRefresh,  setLastRefresh] = useState<Date | null>(null)
  const mountedRef = useRef(true)

  const fetchLog = useCallback(async () => {
    try {
      const data = await apiFetch<WranglerEvent[]>('/api/virtual-wrangler/activity-log')
      if (mountedRef.current) {
        setEvents(Array.isArray(data) ? data : [])
        setError('')
        setLastRefresh(new Date())
      }
    } catch (e: unknown) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchLog()
    const id = setInterval(fetchLog, 30_000)
    return () => { mountedRef.current = false; clearInterval(id) }
  }, [fetchLog])

  const clearLog = async () => {
    setClearing(true)
    try {
      await apiFetch('/api/virtual-wrangler/activity-log', { method: 'DELETE' })
      setEvents([])
      setShowConfirm(false)
    } catch { /* ignore */ }
    finally { setClearing(false) }
  }

  return (
    <div className="wrangler-card">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Activity Log</h3>
          {lastRefresh && (
            <p className="text-xs text-gray-600 mt-0.5">
              Last refreshed {lastRefresh.toLocaleTimeString()} · auto-refresh every 30s
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={fetchLog}
            className="admin-btn-ghost px-3 py-1.5 text-xs">
            ↺ Refresh
          </button>
          <button type="button" onClick={() => setShowConfirm(true)}
            className="admin-confirm-remove-btn px-3 py-1.5 text-xs">
            Clear Log
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <ConfirmModal
          message="Clear all wrangler activity events? This cannot be undone."
          onConfirm={clearLog}
          onCancel={() => setShowConfirm(false)}
          busy={clearing}
        />
      )}

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-gray-600 text-sm">Loading…</p>
      ) : error ? (
        <p className="py-8 text-center text-red-500 text-sm">{error}</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['TIMESTAMP', 'WRANGLER', 'JOB ID', 'ACTION', 'DETAILS'].map(h => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-600 text-sm">
                    No wrangler events yet. Events appear here when a wrangler takes action on your jobs.
                  </td>
                </tr>
              ) : events.map(e => (
                <tr key={e.id} className="jobs-tbody-row">
                  <td className="jobs-td font-mono text-xs text-gray-500 whitespace-nowrap">{fmtDate(e.ts)}</td>
                  <td className="jobs-td text-gray-300 whitespace-nowrap">{e.wrangler}</td>
                  <td className="jobs-td">
                    <a href={`/jobs/${e.jobNumber}`} className="font-mono text-blue-400 hover:underline text-xs">
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface AllSettings {
  max_runtime?:      Record<string, unknown>
  relocation?:       Record<string, unknown>
  spot_to_ondemand?: Record<string, unknown>
  syncer?:           Record<string, unknown>
}

export default function VirtualWranglerPage() {
  const [settings, setSettings] = useState<AllSettings | null>(null)
  const [loadErr,  setLoadErr]  = useState('')

  useEffect(() => {
    apiFetch<AllSettings>('/api/virtual-wrangler/settings')
      .then(s => setSettings(s))
      .catch(() => setLoadErr('Failed to load wrangler settings.'))
  }, [])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Virtual Wrangler</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
          BETA
        </span>
      </div>

      {/* Intro */}
      <p className="text-sm text-gray-400">
        Virtual Wranglers allow you to set parameters to oversee and manage the function of your jobs
        on the render farm. These settings affect{' '}
        <span className="text-gray-200 font-medium">all</span> jobs run in the account and run
        automatically every 5 minutes via a scheduled background worker.
      </p>

      {loadErr && (
        <div className="enterprise-alert-error">{loadErr}</div>
      )}

      {/* 4 wrangler cards — render once settings are loaded */}
      {settings && (
        <>
          <MaxRuntimeCard    init={settings.max_runtime      ?? {}} />
          <RelocationCard    init={settings.relocation       ?? {}} />
          <SpotToOnDemandCard init={settings.spot_to_ondemand ?? {}} />
          <SyncerCard        init={settings.syncer           ?? {}} />
        </>
      )}

      {/* Activity Log — always visible */}
      <ActivityLog />
    </div>
  )
}
