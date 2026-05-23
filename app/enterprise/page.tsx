'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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
  mergePolicy: 'append' | 'exclusive' | 'replace'
}

interface Instance {
  id: string
  available: boolean
  cpu: string
  memory: string
  gpu: string
  instanceType: string
  cloudProvider: string
  os: string
  type: 'CPU' | 'GPU'
}

// ---------------------------------------------------------------------------
// Mock available instances data
// ---------------------------------------------------------------------------
const INSTANCES: Instance[] = [
  { id: '1',  available: true,  cpu: '2',   memory: '1.8 GB',   gpu: '—',           instanceType: 'n1-highcpu-2',       cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '2',  available: true,  cpu: '4',   memory: '3.6 GB',   gpu: '—',           instanceType: 'n1-highcpu-4',       cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '3',  available: true,  cpu: '8',   memory: '7.2 GB',   gpu: '—',           instanceType: 'n1-highcpu-8',       cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '4',  available: true,  cpu: '16',  memory: '14.4 GB',  gpu: '—',           instanceType: 'n1-highcpu-16',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '5',  available: true,  cpu: '32',  memory: '28.8 GB',  gpu: '—',           instanceType: 'n1-highcpu-32',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '6',  available: true,  cpu: '64',  memory: '57.6 GB',  gpu: '—',           instanceType: 'n1-highcpu-64',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '7',  available: false, cpu: '96',  memory: '86.4 GB',  gpu: '—',           instanceType: 'n1-highcpu-96',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '8',  available: true,  cpu: '4',   memory: '15 GB',    gpu: '—',           instanceType: 'n1-standard-4',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '9',  available: true,  cpu: '8',   memory: '30 GB',    gpu: '—',           instanceType: 'n1-standard-8',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '10', available: true,  cpu: '16',  memory: '60 GB',    gpu: '—',           instanceType: 'n1-standard-16',     cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '11', available: true,  cpu: '32',  memory: '120 GB',   gpu: '—',           instanceType: 'n1-standard-32',     cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '12', available: true,  cpu: '64',  memory: '240 GB',   gpu: '—',           instanceType: 'n1-standard-64',     cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '13', available: true,  cpu: '4',   memory: '26 GB',    gpu: '—',           instanceType: 'n1-highmem-4',       cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '14', available: true,  cpu: '8',   memory: '52 GB',    gpu: '—',           instanceType: 'n1-highmem-8',       cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '15', available: true,  cpu: '16',  memory: '104 GB',   gpu: '—',           instanceType: 'n1-highmem-16',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'CPU' },
  { id: '16', available: true,  cpu: '8',   memory: '52 GB',    gpu: '1x T4',       instanceType: 'n1-highmem-8-t4',    cloudProvider: 'Google Cloud', os: 'Linux', type: 'GPU' },
  { id: '17', available: true,  cpu: '16',  memory: '104 GB',   gpu: '2x T4',       instanceType: 'n1-highmem-16-t4',   cloudProvider: 'Google Cloud', os: 'Linux', type: 'GPU' },
  { id: '18', available: true,  cpu: '16',  memory: '104 GB',   gpu: '1x V100',     instanceType: 'n1-highmem-16-v100', cloudProvider: 'Google Cloud', os: 'Linux', type: 'GPU' },
  { id: '19', available: false, cpu: '32',  memory: '208 GB',   gpu: '4x V100',     instanceType: 'n1-highmem-32-v100', cloudProvider: 'Google Cloud', os: 'Linux', type: 'GPU' },
  { id: '20', available: true,  cpu: '12',  memory: '85 GB',    gpu: '1x A100 40G', instanceType: 'a2-highgpu-1g',      cloudProvider: 'Google Cloud', os: 'Linux', type: 'GPU' },
]

// ---------------------------------------------------------------------------
// Toggle
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
// Add ShotGrid modal
// ---------------------------------------------------------------------------
function AddShotGridModal({ onClose, onAdd }: {
  onClose: () => void
  onAdd: (cfg: ShotGridConfig) => void
}) {
  const [project,    setProject]    = useState('')
  const [projectId,  setProjectId]  = useState('')
  const [host,       setHost]       = useState('')
  const [scriptName, setScriptName] = useState('')
  const [apiKey,     setApiKey]     = useState('')

  const handleSubmit = () => {
    if (!project || !projectId || !host || !scriptName || !apiKey) return
    onAdd({ id: Date.now().toString(), conductorProject: project, shotgridProjectId: projectId, shotgridHost: host, scriptName, apiKey })
    onClose()
  }

  return (
    <div className="enterprise-modal-overlay">
      <div className="enterprise-modal-card">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Add ShotGrid Configuration</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>
        {[
          { id: 'sg-project', label: 'Conductor Project',    val: project,    set: setProject    },
          { id: 'sg-pid',     label: 'ShotGrid Project ID',  val: projectId,  set: setProjectId  },
          { id: 'sg-host',    label: 'ShotGrid Host',        val: host,       set: setHost,       placeholder: 'https://yoursite.shotgrid.autodesk.com' },
          { id: 'sg-script',  label: 'ShotGrid Script Name', val: scriptName, set: setScriptName },
          { id: 'sg-api',     label: 'ShotGrid API Key',     val: apiKey,     set: setApiKey     },
        ].map(({ id, label, val, set, placeholder }) => (
          <div key={id}>
            <label htmlFor={id} className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</label>
            <input id={id} type="text" value={val} placeholder={placeholder ?? ''}
              onChange={(e) => set(e.target.value)} className="calc-input px-3 py-2" />
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={handleSubmit} className="admin-btn-primary px-5 py-2">Save</button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded text-sm text-gray-400 border border-white/10 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ShotGrid Tab
// ---------------------------------------------------------------------------
function ShotGridTab() {
  const [configs,   setConfigs]   = useState<ShotGridConfig[]>([])
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="admin-panel">
      <p className="text-sm text-gray-400 mb-5">
        Adding a ShotGrid configuration allows Conductor to push events to your ShotGrid instance
        to be used with the ShotGrid Event Daemon. Please see the{' '}
        <a href="/documentation" className="text-blue-400 hover:underline">docs</a> for more details.
      </p>

      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="jobs-thead-row">
              {['CONDUCTOR PROJECT','SHOTGRID PROJECT ID','SHOTGRID HOST','SHOTGRID SCRIPT NAME','SHOTGRID API KEY',''].map((h) => (
                <th key={h} className="jobs-th">{h}</th>
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
            ) : (
              configs.map((cfg) => (
                <tr key={cfg.id} className="jobs-tbody-row">
                  <td className="jobs-td text-gray-300">{cfg.conductorProject}</td>
                  <td className="jobs-td text-gray-400">{cfg.shotgridProjectId}</td>
                  <td className="jobs-td text-gray-400 font-mono text-xs">{cfg.shotgridHost}</td>
                  <td className="jobs-td text-gray-400">{cfg.scriptName}</td>
                  <td className="jobs-td font-mono text-xs text-gray-500">{'•'.repeat(20)}</td>
                  <td className="jobs-td">
                    <button type="button" onClick={() => setConfigs((c) => c.filter((x) => x.id !== cfg.id))}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors">Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <button type="button" onClick={() => setShowModal(true)}
          className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
          Add
        </button>
      </div>

      {showModal && (
        <AddShotGridModal
          onClose={() => setShowModal(false)}
          onAdd={(cfg) => setConfigs((c) => [...c, cfg])}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Studio Management Tab
// ---------------------------------------------------------------------------
function StudioManagementTab() {
  const [ssoEnabled,    setSsoEnabled]    = useState(false)
  const [domain,        setDomain]        = useState('')
  const [allowedEmails, setAllowedEmails] = useState('')
  const [saved,         setSaved]         = useState(false)
  const [envVars,       setEnvVars]       = useState<EnvVar[]>([])
  const [newKey,        setNewKey]        = useState('')
  const [newVal,        setNewVal]        = useState('')
  const [newPolicy,     setNewPolicy]     = useState<EnvVar['mergePolicy']>('append')
  const [selected,      setSelected]      = useState<Set<string>>(new Set())

  const addEnvVar = () => {
    if (!newKey) return
    setEnvVars((prev) => [...prev, { id: Date.now().toString(), key: newKey, value: newVal, mergePolicy: newPolicy }])
    setNewKey('')
    setNewVal('')
    setNewPolicy('append')
  }

  const toggleInstance = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(INSTANCES.map((i) => i.id)))
    else setSelected(new Set())
  }

  return (
    <div className="admin-panel flex flex-col gap-6">

      {saved && (
        <div className="enterprise-alert-success">
          ✓ Studio settings saved
        </div>
      )}

      {/* SSO */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Single Sign-On (SSO)</h3>
        <div className="enterprise-settings-box">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">Enable SSO</p>
              <p className="text-xs text-gray-500 mt-0.5">Require users to log in via your identity provider.</p>
            </div>
            <Toggle id="sso-toggle" checked={ssoEnabled} onChange={() => setSsoEnabled((v) => !v)} />
          </div>
          {ssoEnabled && (
            <div className="mt-4">
              <label htmlFor="sso-domain" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Identity Provider URL</label>
              <input id="sso-domain" type="url" value={domain} onChange={(e) => setDomain(e.target.value)}
                placeholder="https://your-idp.com/saml/metadata" className="calc-input px-3 py-2" />
            </div>
          )}
        </div>
      </div>

      {/* Allowed domains */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Allowed Email Domains</h3>
        <div className="enterprise-settings-box">
          <label htmlFor="allowed-domains" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Domains
          </label>
          <input id="allowed-domains" type="text" value={allowedEmails}
            onChange={(e) => setAllowedEmails(e.target.value)}
            placeholder="swadeart.com, example.com"
            className="calc-input px-3 py-2" />
          <p className="text-xs text-gray-600 mt-1.5">Comma-separated. Only users with these email domains can join the account.</p>
        </div>
      </div>

      {/* Environment Variables */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Environment Variables</h3>
          <button type="button" onClick={addEnvVar}
            className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
            Add
          </button>
        </div>

        {/* Add row */}
        <div className="enterprise-settings-box mb-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="env-key" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Key</label>
              <input id="env-key" type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
                placeholder="MY_VAR" className="calc-input px-3 py-1.5 text-xs" />
            </div>
            <div className="flex-1">
              <label htmlFor="env-val" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Value</label>
              <input id="env-val" type="text" value={newVal} onChange={(e) => setNewVal(e.target.value)}
                placeholder="value" className="calc-input px-3 py-1.5 text-xs" />
            </div>
            <div className="w-36">
              <label htmlFor="env-policy" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Merge Policy</label>
              <select id="env-policy" title="Merge policy" value={newPolicy}
                onChange={(e) => setNewPolicy(e.target.value as EnvVar['mergePolicy'])}
                className="calc-input px-2 py-1.5 text-xs">
                <option value="append">Append</option>
                <option value="exclusive">Exclusive</option>
                <option value="replace">Replace</option>
              </select>
            </div>
            <button type="button" onClick={addEnvVar}
              className="admin-btn-primary px-4 py-1.5 text-xs whitespace-nowrap">
              + Add
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                {['KEY','VALUE','MERGE POLICY',''].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {envVars.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-600 text-sm">
                    No environment variables. Click <span className="text-gray-400">Add</span> to create one.
                  </td>
                </tr>
              ) : (
                envVars.map((ev) => (
                  <tr key={ev.id} className="jobs-tbody-row">
                    <td className="jobs-td font-mono text-xs text-blue-400">{ev.key}</td>
                    <td className="jobs-td font-mono text-xs text-gray-400">{ev.value}</td>
                    <td className="jobs-td">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                        {ev.mergePolicy}
                      </span>
                    </td>
                    <td className="jobs-td">
                      <button type="button"
                        onClick={() => setEnvVars((prev) => prev.filter((x) => x.id !== ev.id))}
                        className="text-xs text-gray-500 hover:text-red-400 transition-colors">Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Available Instances */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-3">Available Instances</h3>
        <p className="text-xs text-gray-500 mb-3">
          Select which instance types are available for use in this account. Unchecked instances will not appear in the job submitter.
        </p>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="jobs-thead-row">
                <th className="jobs-th w-10">
                  <input type="checkbox" title="Select all instances"
                    checked={selected.size === INSTANCES.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="w-3.5 h-3.5 rounded" />
                </th>
                {['AVAILABLE','CPU','MEMORY','GPU','INSTANCE TYPE','CLOUD PROVIDER','OPERATING SYSTEM','TYPE'].map((h) => (
                  <th key={h} className="jobs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INSTANCES.map((inst) => (
                <tr key={inst.id} className="jobs-tbody-row">
                  <td className="jobs-td">
                    <input type="checkbox" title={`Select ${inst.instanceType}`}
                      checked={selected.has(inst.id)}
                      onChange={() => toggleInstance(inst.id)}
                      className="w-3.5 h-3.5 rounded" />
                  </td>
                  <td className="jobs-td">
                    {inst.available ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-600 inline-block" />
                        No
                      </span>
                    )}
                  </td>
                  <td className="jobs-td text-gray-300 font-mono text-xs">{inst.cpu}</td>
                  <td className="jobs-td text-gray-400 font-mono text-xs">{inst.memory}</td>
                  <td className="jobs-td text-gray-400 text-xs">{inst.gpu}</td>
                  <td className="jobs-td font-mono text-xs text-gray-400">{inst.instanceType}</td>
                  <td className="jobs-td text-xs text-gray-400">{inst.cloudProvider}</td>
                  <td className="jobs-td text-xs text-gray-400">{inst.os}</td>
                  <td className="jobs-td">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                      inst.type === 'GPU'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {inst.type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-white/5">
        <button type="button" className="admin-btn-primary px-6 py-2 text-sm"
          onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}>
          Save Settings
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'shotgrid', label: 'ShotGrid',          panel: <ShotGridTab />         },
  { id: 'studio',   label: 'Studio Management', panel: <StudioManagementTab /> },
] as const

type TabId = (typeof TABS)[number]['id']

export default function EnterprisePage() {
  const [active, setActive] = useState<TabId>('shotgrid')
  const currentPanel = TABS.find((t) => t.id === active)?.panel

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Enterprise</h1>
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
