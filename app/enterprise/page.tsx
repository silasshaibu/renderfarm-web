'use client'

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { useApiFetch } from '@/hooks/useApiFetch'

// ─────────────────────────────────────────────────────────────────────────────
// Toast (reused pattern — self-contained here so Enterprise page is standalone)
// ─────────────────────────────────────────────────────────────────────────────
type TType  = 'success' | 'error'
interface TItem { id: number; msg: string; type: TType }
interface Toaster { success(m: string): void; error(m: string): void }
const ToastCtx = createContext<Toaster>({ success: () => {}, error: () => {} })
const useToast  = () => useContext(ToastCtx)
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
// Shared
// ─────────────────────────────────────────────────────────────────────────────
function BlueBtn({ label, onClick, disabled }: { label: string; onClick?(): void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={['admin-btn-blue md', disabled ? 'opacity-50 cursor-not-allowed' : ''].join(' ')}>
      {label}
    </button>
  )
}
function GrayBtn({ label, onClick, disabled }: { label: string; onClick?(): void; disabled?: boolean }) {
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

// Cloud provider icon
function GcpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="#4285F4" opacity=".12"/>
      <path d="M16.93 8H7.07C8.17 5.61 9.93 4 12 4s3.83 1.61 4.93 4z" fill="#EA4335"/>
      <path d="M20 12c0 1.08-.22 2.1-.61 3.04l-2.19-1.27A5.95 5.95 0 0 0 18 12c0-.62-.1-1.22-.28-1.77l2.19-1.27C20.29 9.9 20.5 10.93 20 12z" fill="#FBBC05"/>
      <path d="M16.93 16H7.07A7.96 7.96 0 0 1 4 12c0-1.08.22-2.1.61-3.04l2.19 1.27A5.95 5.95 0 0 0 6 12c0 1.12.31 2.16.83 3.06L4.64 16.3A8 8 0 0 0 12 20c2.07 0 3.83-1.61 4.93-4z" fill="#34A853"/>
      <path d="M4.64 16.3l2.19-1.24A5.97 5.97 0 0 0 12 18c2.3 0 4.3-1.3 5.36-3.24l2.19 1.24A8 8 0 0 1 12 20a7.97 7.97 0 0 1-7.36-3.7z" fill="#4285F4"/>
    </svg>
  )
}

// Linux penguin icon (simplified)
function LinuxIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path d="M12 2C6.7 2 2 6.7 2 12s4.7 10 10 10 10-4.7 10-10S17.3 2 12 2z" fill="#f6c90e" opacity=".15"/>
      <circle cx="9"  cy="10" r="1.2" fill="#f6c90e"/>
      <circle cx="15" cy="10" r="1.2" fill="#f6c90e"/>
      <path d="M9 14c.5 1.5 5.5 1.5 6 0" stroke="#f6c90e" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      <path d="M8 7c0-4 8-4 8 0v4c0 3-8 3-8 0V7z" stroke="#9ca3af" strokeWidth="1.2" fill="none"/>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ShotGridConfig {
  id: string
  conductorProject: string
  shotgridProjectId: string
  shotgridHost: string
  scriptName: string
  apiKey: string
}

interface EnvVar {
  id: string
  key: string
  value: string
  mergePolicy: string
}

interface EnterpriseInstance {
  id: string
  label: string
  instanceType: string
  instance: string   // 'GPU' | 'CPU'
  vcpu: number
  ramGb: number
  gpuMemory: string
  enabled: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// ShotGrid modal (Add / Edit)
// ─────────────────────────────────────────────────────────────────────────────
interface SgModalProps {
  initial?: Partial<ShotGridConfig>
  projects: string[]
  onClose(): void
  onSave(data: Omit<ShotGridConfig, 'id'>): void
  saving: boolean
}

function ShotGridModal({ initial, projects, onClose, onSave, saving }: SgModalProps) {
  const [conductorProject,  setConductorProject]  = useState(initial?.conductorProject  ?? '')
  const [shotgridProjectId, setShotgridProjectId] = useState(initial?.shotgridProjectId ?? '')
  const [shotgridHost,      setShotgridHost]      = useState(initial?.shotgridHost      ?? '')
  const [scriptName,        setScriptName]        = useState(initial?.scriptName        ?? '')
  const [apiKey,            setApiKey]            = useState(initial?.apiKey            ?? '')
  const [showKey,           setShowKey]           = useState(false)

  const isEdit = Boolean(initial?.id)

  const handleSave = () => {
    onSave({ conductorProject, shotgridProjectId, shotgridHost, scriptName, apiKey })
  }

  return (
    <div className="enterprise-modal-overlay" onClick={onClose}>
      <div className="enterprise-modal-card" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">
            {isEdit ? 'Edit ShotGrid Configuration' : 'Add ShotGrid Configuration'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Conductor Project */}
          <div>
            <label htmlFor="sg-project" className="enterprise-field-label">Conductor Project</label>
            {projects.length > 0 ? (
              <select id="sg-project" value={conductorProject}
                onChange={e => setConductorProject(e.target.value)}
                className="calc-input px-3 py-2 w-full" title="Select Conductor project">
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input id="sg-project" type="text" value={conductorProject}
                onChange={e => setConductorProject(e.target.value)}
                placeholder="Project name" className="calc-input px-3 py-2 w-full" />
            )}
          </div>

          {/* ShotGrid Project Id */}
          <div>
            <label htmlFor="sg-pid" className="enterprise-field-label">ShotGrid Project Id</label>
            <input id="sg-pid" type="number" value={shotgridProjectId}
              onChange={e => setShotgridProjectId(e.target.value)}
              placeholder="12345" className="calc-input px-3 py-2 w-full" />
          </div>

          {/* ShotGrid Host */}
          <div>
            <label htmlFor="sg-host" className="enterprise-field-label">ShotGrid Host</label>
            <input id="sg-host" type="url" value={shotgridHost}
              onChange={e => setShotgridHost(e.target.value)}
              placeholder="https://mystudio.shotgrid.autodesk.com"
              className="calc-input px-3 py-2 w-full" />
          </div>

          {/* ShotGrid Script Name */}
          <div>
            <label htmlFor="sg-script" className="enterprise-field-label">ShotGrid Script Name</label>
            <input id="sg-script" type="text" value={scriptName}
              onChange={e => setScriptName(e.target.value)}
              placeholder="renderfarm_script" className="calc-input px-3 py-2 w-full" />
          </div>

          {/* ShotGrid API Key */}
          <div>
            <label htmlFor="sg-api" className="enterprise-field-label">ShotGrid API Key</label>
            <div className="relative">
              <input id="sg-api" type={showKey ? 'text' : 'password'} value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="••••••••••••••••"
                className="calc-input px-3 py-2 w-full pr-10" />
              <button type="button"
                onClick={() => setShowKey(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <BlueBtn label={saving ? 'Saving…' : 'Save'} onClick={handleSave} disabled={saving} />
          <GrayBtn label="Cancel" onClick={onClose} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirm dialog
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmModal({ msg, onConfirm, onCancel }: { msg: string; onConfirm(): void; onCancel(): void }) {
  return (
    <div className="enterprise-modal-overlay" onClick={onCancel}>
      <div className="enterprise-modal-card admin-confirm-card" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-gray-300 mb-4">{msg}</p>
        <div className="flex gap-2">
          <GrayBtn label="Cancel" onClick={onCancel} />
          <button type="button" onClick={onConfirm} className="admin-confirm-remove-btn">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy-to-clipboard icon button
// ─────────────────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" onClick={copy} title="Copy API key" aria-label="Copy API key"
      className="ml-1.5 text-gray-600 hover:text-gray-300 transition-colors">
      {copied
        ? <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
        : <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path d="M8 2a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H8zm0 2h2v3a1 1 0 001 1h3v6H8V4z"/></svg>
      }
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOTGRID TAB
// ─────────────────────────────────────────────────────────────────────────────
function ShotGridTab() {
  const toast = useToast()
  const { data: sgData, loading, refetch } = useApiFetch(() =>
    fetch('/api/enterprise/shotgrid', { headers: authHeaders() }).then(r => r.json())
  )
  const { data: projData } = useApiFetch(() =>
    fetch('/api/projects', { headers: authHeaders() }).then(r => r.json())
  )

  const configs: ShotGridConfig[] = (sgData as ShotGridConfig[] | null) ?? []
  const projects: string[] = ((projData as { name: string }[] | null) ?? [])
    .filter((p: { isActive?: boolean }) => p.isActive !== false)
    .map((p: { name: string }) => p.name)

  const [showModal,    setShowModal]    = useState(false)
  const [editTarget,   setEditTarget]   = useState<ShotGridConfig | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShotGridConfig | null>(null)
  const [saving,       setSaving]       = useState(false)

  const handleAdd = async (data: Omit<ShotGridConfig, 'id'>) => {
    setSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res = await fetch('/api/enterprise/shotgrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('ShotGrid configuration added.')
      setShowModal(false)
      await refetch()
    } catch { toast.error('Failed to save configuration.') }
    finally { setSaving(false) }
  }

  const handleEdit = async (data: Omit<ShotGridConfig, 'id'>) => {
    if (!editTarget) return
    setSaving(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      const res = await fetch(`/api/enterprise/shotgrid/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Configuration updated.')
      setEditTarget(null)
      await refetch()
    } catch { toast.error('Failed to update configuration.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
      await fetch(`/api/enterprise/shotgrid/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      toast.success('Configuration deleted.')
      setDeleteTarget(null)
      await refetch()
    } catch { toast.error('Failed to delete configuration.') }
  }

  return (
    <div className="admin-panel">
      {deleteTarget && (
        <ConfirmModal
          msg={`Delete the ShotGrid configuration for "${deleteTarget.conductorProject}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {showModal && (
        <ShotGridModal
          projects={projects}
          onClose={() => setShowModal(false)}
          onSave={handleAdd}
          saving={saving}
        />
      )}
      {editTarget && (
        <ShotGridModal
          initial={editTarget}
          projects={projects}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
          saving={saving}
        />
      )}

      <h2 className="enterprise-section-title mb-3">ShotGrid Configurations</h2>

      <p className="text-sm text-gray-400 mb-5">
        Adding a ShotGrid configuration allows Conductor to push events to your ShotGrid instance
        to be used with the ShotGrid Event Daemon. Please see the{' '}
        <a href="https://docs.conductortech.com/integrations/shotgrid/"
          target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:underline">docs</a>{' '}
        for more details.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading…</div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['Conductor Project','ShotGrid Project Id','ShotGrid Host','ShotGrid Script Name','ShotGrid API Key',''].map(h => (
                  <th key={h} className="jobs-th enterprise-th-titlecase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {configs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-600 text-sm">
                    No ShotGrid configurations yet. Click <span className="text-gray-400">Add</span> to create one.
                  </td>
                </tr>
              ) : configs.map(cfg => (
                <tr key={cfg.id} className="jobs-tbody-row">
                  <td className="jobs-td text-gray-300 font-medium">{cfg.conductorProject}</td>
                  <td className="jobs-td text-gray-400">{cfg.shotgridProjectId}</td>
                  <td className="jobs-td text-gray-400 font-mono text-xs">{cfg.shotgridHost}</td>
                  <td className="jobs-td text-gray-400">{cfg.scriptName}</td>
                  <td className="jobs-td">
                    <span className="flex items-center gap-0 font-mono text-xs text-gray-500">
                      {'•'.repeat(12)}
                      <CopyBtn text={cfg.apiKey} />
                    </span>
                  </td>
                  <td className="jobs-td">
                    <div className="flex gap-3">
                      <button type="button"
                        onClick={() => setEditTarget(cfg)}
                        className="text-xs text-gray-500 hover:text-blue-400 transition-colors">
                        Edit
                      </button>
                      <button type="button"
                        onClick={() => setDeleteTarget(cfg)}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4">
        <GrayBtn label="Add" onClick={() => setShowModal(true)} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

const MERGE_POLICIES = ['append', 'exclusive', 'prepend'] as const

// ─────────────────────────────────────────────────────────────────────────────
// STUDIO MANAGEMENT TAB
// ─────────────────────────────────────────────────────────────────────────────
function StudioManagementTab() {
  const toast = useToast()

  // ── Environment Variables ─────────────────────────────────────────────────
  const { data: evData, loading: evLoading, refetch: evRefetch } = useApiFetch(() =>
    fetch('/api/enterprise/env-vars', { headers: authHeaders() }).then(r => r.json())
  )
  const [envVars,  setEnvVars]  = useState<EnvVar[]>([])
  const [evSaving, setEvSaving] = useState(false)

  // Populate when API data arrives
  useEffect(() => {
    if (evData) setEnvVars(evData as EnvVar[])
  }, [evData])

  const addEnvRow = () => {
    setEnvVars(prev => [...prev, { id: `local-${Date.now()}`, key: '', value: '', mergePolicy: 'append' }])
  }

  const updateEnvRow = (id: string, field: keyof EnvVar, val: string) => {
    setEnvVars(prev => prev.map(ev => ev.id === id ? { ...ev, [field]: val } : ev))
  }

  const removeEnvRow = (id: string) => {
    setEnvVars(prev => prev.filter(ev => ev.id !== id))
  }

  const saveEnvVars = async () => {
    for (const ev of envVars) {
      if (!ev.key.trim()) { toast.error('Key cannot be empty'); return }
    }
    setEvSaving(true)
    try {
      const res = await fetch('/api/enterprise/env-vars', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ vars: envVars.map(ev => ({ key: ev.key, value: ev.value, mergePolicy: ev.mergePolicy })) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Save failed' }))
        throw new Error(err.message)
      }
      toast.success('Environment variables saved.')
      await evRefetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save environment variables.')
    } finally { setEvSaving(false) }
  }

  // ── Available Instances ───────────────────────────────────────────────────
  const { data: instData, loading: instLoading, refetch: instRefetch } = useApiFetch(() =>
    fetch('/api/enterprise/instances', { headers: authHeaders() }).then(r => r.json())
  )
  const [instances,   setInstances]   = useState<EnterpriseInstance[]>([])
  const [availStaged, setAvailStaged] = useState<Record<string, boolean>>({})
  const [rowSel,      setRowSel]      = useState<Set<string>>(new Set())
  const [instSearch,  setInstSearch]  = useState('')
  const [instSaving,  setInstSaving]  = useState(false)

  useEffect(() => {
    if (instData) setInstances(instData as EnterpriseInstance[])
  }, [instData])

  const getAvail = (id: string, def: boolean) => availStaged[id] !== undefined ? availStaged[id] : def

  const filtered = instances.filter(inst => {
    if (!instSearch) return true
    const q = instSearch.toLowerCase()
    return (
      inst.instanceType.toLowerCase().includes(q) ||
      inst.label.toLowerCase().includes(q)        ||
      inst.gpuMemory.toLowerCase().includes(q)    ||
      String(inst.vcpu).includes(q)
    )
  })

  const setAvail = (id: string, val: boolean) =>
    setAvailStaged(s => ({ ...s, [id]: val }))

  const checkAll   = () => instances.forEach(i => setAvail(i.id, true))
  const uncheckAll = () => instances.forEach(i => setAvail(i.id, false))
  const checkSelected   = () => rowSel.forEach(id => setAvail(id, true))
  const uncheckSelected = () => rowSel.forEach(id => setAvail(id, false))

  const toggleRowSel = (id: string) =>
    setRowSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const saveInstances = async () => {
    setInstSaving(true)
    try {
      const payload = instances.map(i => ({
        id:      i.id,
        enabled: getAvail(i.id, i.enabled),
      }))
      const res = await fetch('/api/enterprise/instances', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ instances: payload }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Instance settings saved.')
      setAvailStaged({})
      await instRefetch()
    } catch { toast.error('Failed to save instance settings.') }
    finally { setInstSaving(false) }
  }

  const fmtCpu = (vcpu: number) => `${vcpu} core${vcpu !== 1 ? 's' : ''}`
  const fmtMem = (gb: number)   => `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB Mem`
  const fmtGpu = (gpu: string)  => gpu || '—'
  const instanceBadge = (inst: string) =>
    inst === 'GPU'
      ? <span className="enterprise-badge enterprise-badge--spot">spot</span>
      : <span className="enterprise-badge enterprise-badge--ondemand">on-demand</span>

  return (
    <div className="flex flex-col gap-6">

      {/* ── Environment Variables ─────────────────────────────────── */}
      <div className="admin-panel enterprise-section-card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="enterprise-section-title">Environment Variables</h2>
          <BlueBtn label={evSaving ? 'Saving…' : 'Save'} onClick={saveEnvVars} disabled={evSaving} />
        </div>
        <p className="text-sm text-gray-400 mb-4">
          The environment variables below will be provided as default values on all integrated
          Conductor submitters for supported DCCs.
        </p>
        <div className="mb-3">
          <GrayBtn label="Add" onClick={addEnvRow} />
        </div>

        {evLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading…</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="jobs-thead-row">
                  {['KEY','VALUE','MERGE POLICY',''].map(h => (
                    <th key={h} className="jobs-th">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {envVars.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-600 text-sm">
                      No entries found. Add an Environment Variable using the Add button.
                    </td>
                  </tr>
                ) : envVars.map(ev => (
                  <tr key={ev.id} className="jobs-tbody-row">
                    <td className="jobs-td">
                      <input type="text" value={ev.key} placeholder="KEY"
                        onChange={e => updateEnvRow(ev.id, 'key', e.target.value)}
                        className="calc-input px-2 py-1 text-xs font-mono w-full min-w-[120px] text-blue-400" />
                    </td>
                    <td className="jobs-td">
                      <input type="text" value={ev.value} placeholder="value"
                        onChange={e => updateEnvRow(ev.id, 'value', e.target.value)}
                        className="calc-input px-2 py-1 text-xs font-mono w-full min-w-[160px]" />
                    </td>
                    <td className="jobs-td">
                      <select value={ev.mergePolicy}
                        onChange={e => updateEnvRow(ev.id, 'mergePolicy', e.target.value)}
                        className="calc-input px-2 py-1 text-xs w-28" title="Merge policy">
                        {MERGE_POLICIES.map(p => (
                          <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="jobs-td">
                      <button type="button" onClick={() => removeEnvRow(ev.id)}
                        aria-label="Remove row"
                        className="text-gray-500 hover:text-red-400 transition-colors">
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Available Instances ────────────────────────────────────── */}
      <div className="admin-panel enterprise-section-card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="enterprise-section-title">Available Instances</h2>
          <BlueBtn label={instSaving ? 'Saving…' : 'Save'} onClick={saveInstances} disabled={instSaving} />
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Choose which instances are available for your users. Admins and owners will still see
          all instance types, while users will be offered the selected instance types.
        </p>

        {/* Bulk action buttons + search */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex gap-2 flex-wrap">
            <GrayBtn label="Check All"        onClick={checkAll}          />
            <GrayBtn label="Uncheck All"      onClick={uncheckAll}        />
            <GrayBtn label="Check Selected"   onClick={checkSelected}   disabled={rowSel.size === 0} />
            <GrayBtn label="Uncheck Selected" onClick={uncheckSelected} disabled={rowSel.size === 0} />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="inst-search" className="text-xs text-gray-500">Search:</label>
            <input id="inst-search" type="text" placeholder="Filter instances…"
              value={instSearch} onChange={e => setInstSearch(e.target.value)}
              className="calc-input px-2 py-1 text-xs w-44" />
          </div>
        </div>

        {instLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4"><Spinner /> Loading instances…</div>
        ) : (
          <>
            <div className="overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="jobs-thead-row">
                    {['Available','CPU','Memory','GPU','Instance Type','Cloud Provider','Operating System','Type'].map(h => (
                      <th key={h} className="jobs-th enterprise-th-titlecase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-gray-600 text-sm">
                        {instSearch ? 'No instances match your search.' : 'No instances found.'}
                      </td>
                    </tr>
                  ) : filtered.map(inst => {
                    const isAvail  = getAvail(inst.id, inst.enabled)
                    const isRowSel = rowSel.has(inst.id)
                    return (
                      <tr key={inst.id}
                        onClick={() => toggleRowSel(inst.id)}
                        className={['jobs-tbody-row cursor-pointer select-none', isRowSel ? 'admin-row-selected' : ''].join(' ')}>
                        <td className="jobs-td text-center" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" title={`Toggle ${inst.instanceType}`}
                            checked={isAvail}
                            onChange={e => setAvail(inst.id, e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-blue-500" />
                        </td>
                        <td className="jobs-td text-gray-300 text-xs">{fmtCpu(inst.vcpu)}</td>
                        <td className="jobs-td text-gray-400 text-xs">{fmtMem(inst.ramGb)}</td>
                        <td className="jobs-td text-gray-400 text-xs">{fmtGpu(inst.gpuMemory)}</td>
                        <td className="jobs-td font-mono text-xs text-gray-400">{inst.instanceType}</td>
                        <td className="jobs-td text-xs text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <GcpIcon />
                            Google Cloud
                          </span>
                        </td>
                        <td className="jobs-td text-xs text-gray-400">
                          <span className="flex items-center gap-1.5">
                            <LinuxIcon />
                            Linux
                          </span>
                        </td>
                        <td className="jobs-td">{instanceBadge(inst.instance)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Showing 1 to {filtered.length} of {instances.length} entries
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'shotgrid', label: 'ShotGrid',          Panel: ShotGridTab          },
  { id: 'studio',   label: 'Studio Management', Panel: StudioManagementTab  },
] as const
type TabId = (typeof TABS)[number]['id']

export default function EnterprisePage() {
  const [active, setActive] = useState<TabId>('shotgrid')

  // Tab persistence
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

  const { Panel } = TABS.find(t => t.id === active)!

  return (
    <ToastHost>
      <div className="flex flex-col gap-4">
        <div><h1 className="text-2xl font-semibold text-white tracking-tight">Enterprise</h1></div>
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
