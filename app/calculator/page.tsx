'use client'

import { useState, useMemo, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const OS_OPTIONS = ['Linux', 'Windows'] as const
type OS = (typeof OS_OPTIONS)[number]

const PRIMARY_SOFTWARE = [
  'Blender', 'Maya', 'Houdini', 'Cinema 4D', 'Katana',
  'Clarisse', 'Nuke', 'DaVinci Resolve',
] as const

const ADDITIONAL_SOFTWARE = [
  'Arnold', 'CaraVR', 'Corona', 'Golaem',
  'Karma',  'Miarmy', 'Ocula',  'Ornatrix',
  'Redshift', 'Renderman', 'V-Ray', 'Yeti',
  'Ziva Vfx',
] as const

const CLOUD_PROVIDERS = [
  { id: 'aws',        label: 'Amazon Web Services' },
  { id: 'coreweave', label: 'CoreWeave'            },
  { id: 'gcp',        label: 'Google Cloud Platform'},
] as const
type CloudProvider = (typeof CLOUD_PROVIDERS)[number]['id']

const GPU_COUNTS  = ['None', '1', '2', '4', '8'] as const
const GPU_TYPES   = ['None', 'A100', 'A10G', 'T4', 'V100', 'L40S'] as const
const CPU_CORES   = ['2', '4', '8', '16', '32', '64', '96'] as const
const MEMORY_SIZES = ['8 GB', '16 GB', '32 GB', '64 GB', '128 GB', '256 GB'] as const

// ---------------------------------------------------------------------------
// Pricing (simplified $/hr estimates)
// ---------------------------------------------------------------------------
const SOFTWARE_SURCHARGE: Record<string, number> = {
  Arnold: 0.12, CaraVR: 0.08, Corona: 0.10, Golaem: 0.06,
  Karma: 0.09, Miarmy: 0.07, Ocula: 0.08, Ornatrix: 0.05,
  Redshift: 0.11, Renderman: 0.13, 'V-Ray': 0.12, Yeti: 0.06,
  'Ziva Vfx': 0.10,
}
const GPU_HOURLY: Record<string, number> = {
  None: 0, A100: 3.20, A10G: 1.60, T4: 0.80, V100: 2.40, L40S: 2.00,
}
const PROVIDER_MULT: Record<string, number> = {
  aws: 1.0, coreweave: 0.85, gcp: 0.95,
}

function estimateCost(params: {
  frames: number; minutesPerFrame: number; os: OS
  primary: string; additional: string[]; provider: CloudProvider
  gpuCount: string; gpuType: string; cpuCores: string; memoryGb: string
}): number {
  const totalHours = (params.frames * params.minutesPerFrame) / 60
  const cpuBase    = (Number(params.cpuCores) || 4) * 0.048
  const memBase    = (parseFloat(params.memoryGb) || 16) * 0.006
  const gpuBase    = GPU_HOURLY[params.gpuType] * (Number(params.gpuCount) || 0)
  const swSurcharge = params.additional.reduce((s, sw) => s + (SOFTWARE_SURCHARGE[sw] ?? 0), 0)
  const osAdj      = params.os === 'Windows' ? 0.04 : 0
  const rate       = (cpuBase + memBase + gpuBase + swSurcharge + osAdj) * PROVIDER_MULT[params.provider]
  return totalHours * rate
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function PanelCard({ number, title, children }: {
  number: number; title: string; children: React.ReactNode
}) {
  return (
    <div className="calc-panel">
      <h2 className="calc-panel-title">{number}. {title}</h2>
      <div className="flex flex-col gap-4 mt-4">{children}</div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-300 mb-1">{children}</label>
}

function CalcInput({ id, placeholder, value, onChange, type = 'number' }: {
  id: string; placeholder: string; value: string
  onChange: (v: string) => void; type?: string
}) {
  return (
    <input
      id={id} type={type} placeholder={placeholder} value={value}
      min={type === 'number' ? 0 : undefined}
      onChange={(e) => {
        const v = e.target.value
        if (type === 'number' && v !== '' && Number(v) < 0) return
        onChange(v)
      }}
      className="calc-input"
    />
  )
}

function CalcSelect({ id, value, onChange, children }: {
  id: string; value: string; onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select id={id} title={id} value={value} onChange={(e) => onChange(e.target.value)}
      className="calc-input">
      {children}
    </select>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function CalculatorPage() {
  const [frames,     setFrames]     = useState('')
  const [minsFrame,  setMinsFrame]  = useState('')
  const [os,         setOs]         = useState<OS>('Linux')
  const [primary,    setPrimary]    = useState('')
  const [additional, setAdditional] = useState<string[]>([])
  const [provider,   setProvider]   = useState<CloudProvider>('coreweave')
  const [gpuCount,   setGpuCount]   = useState('None')
  const [gpuType,    setGpuType]    = useState('None')
  const [cpuCores,   setCpuCores]   = useState('')
  const [memoryGb,   setMemoryGb]   = useState('')
  const [zooming, setZooming] = useState(false)
  const figureRef = useRef<HTMLParagraphElement>(null)

  const toggleAdditional = (sw: string) =>
    setAdditional((prev) =>
      prev.includes(sw) ? prev.filter((s) => s !== sw) : [...prev, sw]
    )

  // Button is enabled only when the two required fields have positive values
  const canEstimate = Boolean(frames && minsFrame && Number(frames) > 0 && Number(minsFrame) > 0)

  const handleEstimateClick = useCallback(() => {
    if (!canEstimate || zooming) return
    setZooming(true)
    setTimeout(() => setZooming(false), 400)
  }, [canEstimate, zooming])

  // Live estimate — recomputes automatically on every input change
  const estimate = useMemo(() => {
    if (!frames || !minsFrame) return null
    if (Number(frames) <= 0 || Number(minsFrame) <= 0) return null
    return estimateCost({
      frames: Number(frames), minutesPerFrame: Number(minsFrame),
      os, primary, additional, provider,
      gpuCount, gpuType, cpuCores: cpuCores || '4', memoryGb: memoryGb || '16 GB',
    })
  }, [frames, minsFrame, os, primary, additional, provider, gpuCount, gpuType, cpuCores, memoryGb])

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Calculator</h1>
      </div>

      {/* Main card */}
      <div className="calc-card">
        <h2 className="text-lg font-semibold text-white mb-6">Conductor Pricing Calculator</h2>

        {/* 3-column panel grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 1. Job Details */}
          <PanelCard number={1} title="Job Details">
            <div>
              <FieldLabel><label htmlFor="frames">Number of Frames</label></FieldLabel>
              <CalcInput id="frames" placeholder="" value={frames} onChange={setFrames} />
            </div>
            <div>
              <FieldLabel><label htmlFor="minsFrame">Minutes per Frame</label></FieldLabel>
              <CalcInput id="minsFrame" placeholder="" value={minsFrame} onChange={setMinsFrame} />
            </div>
          </PanelCard>

          {/* 2. Software */}
          <PanelCard number={2} title="Software">
            <div>
              <FieldLabel><label htmlFor="os-select">Operating System</label></FieldLabel>
              <CalcSelect id="os-select" value={os} onChange={(v) => setOs(v as OS)}>
                {OS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </CalcSelect>
              <p className="mt-1.5 text-xs text-gray-500">
                Only choose Windows backend for Windows-only software packages like 3ds Max or X-Particles
              </p>
            </div>

            <div>
              <FieldLabel><label htmlFor="primary-sw">Primary Software</label></FieldLabel>
              <CalcSelect id="primary-sw" value={primary} onChange={setPrimary}>
                <option value="">Choose Primary Software</option>
                {PRIMARY_SOFTWARE.map((s) => <option key={s} value={s}>{s}</option>)}
              </CalcSelect>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-300 mb-2">Additional Software</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {ADDITIONAL_SOFTWARE.map((sw) => (
                  <label key={sw} className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer hover:text-gray-200">
                    <input
                      type="checkbox"
                      className="accent-blue-500 w-3 h-3"
                      checked={additional.includes(sw)}
                      onChange={() => toggleAdditional(sw)}
                    />
                    {sw}
                  </label>
                ))}
              </div>
            </div>
          </PanelCard>

          {/* 3. Hardware */}
          <PanelCard number={3} title="Hardware">
            <div>
              <p className="text-xs font-semibold text-gray-300 mb-2">Cloud Provider</p>
              <div className="flex flex-col gap-1.5">
                {CLOUD_PROVIDERS.map((cp) => (
                  <label key={cp.id} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="radio"
                      name="cloud-provider"
                      className="accent-blue-500"
                      checked={provider === cp.id}
                      onChange={() => setProvider(cp.id)}
                    />
                    {cp.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel><label htmlFor="gpu-count">GPU Count</label></FieldLabel>
                <CalcSelect id="gpu-count" value={gpuCount} onChange={setGpuCount}>
                  {GPU_COUNTS.map((g) => <option key={g} value={g}>{g === 'None' ? 'Choose GPU Count' : g}</option>)}
                </CalcSelect>
              </div>
              <div>
                <FieldLabel><label htmlFor="gpu-type">GPU Type</label></FieldLabel>
                <CalcSelect id="gpu-type" value={gpuType} onChange={setGpuType}>
                  {GPU_TYPES.map((g) => <option key={g} value={g}>{g === 'None' ? 'Choose GPU Type' : g}</option>)}
                </CalcSelect>
              </div>
            </div>

            <div>
              <FieldLabel><label htmlFor="cpu-cores">CPU Cores</label></FieldLabel>
              <CalcSelect id="cpu-cores" value={cpuCores} onChange={setCpuCores}>
                <option value="">Choose CPU Cores</option>
                {CPU_CORES.map((c) => <option key={c} value={c}>{c}</option>)}
              </CalcSelect>
            </div>

            <div>
              <FieldLabel><label htmlFor="memory-gb">Memory GB</label></FieldLabel>
              <CalcSelect id="memory-gb" value={memoryGb} onChange={setMemoryGb}>
                <option value="">Choose Memory Size</option>
                {MEMORY_SIZES.map((m) => <option key={m} value={m}>{m}</option>)}
              </CalcSelect>
            </div>
          </PanelCard>
        </div>

        {/* Estimate Cost button — enabled only when required fields are filled */}
        <button
          type="button"
          onClick={handleEstimateClick}
          disabled={!canEstimate}
          className="calc-estimate-btn mt-6 w-full"
        >
          Estimate Cost
        </button>

        {/* Live result area — updates automatically as inputs change */}
        <div className="calc-result-area mt-4">
          <div className="text-center">
            <p
              ref={figureRef}
              className={`calc-figure text-3xl font-bold text-white${zooming ? ' calc-figure--zoom' : ''}`}
            >
              {estimate !== null ? `$${estimate.toFixed(2)}` : '$0.00'}
            </p>
            {estimate !== null && frames && minsFrame && (
              <p className="text-xs text-gray-500 mt-1">
                {frames} frames × {minsFrame} min/frame on {CLOUD_PROVIDERS.find((p) => p.id === provider)?.label}
              </p>
            )}
          </div>
        </div>

        {/* Always-visible label + disclaimer */}
        <p className="text-center text-sm font-medium text-blue-400 mt-4">
          On-Demand Estimate Total
        </p>
        <p className="text-center text-xs text-blue-500/70 mt-2 max-w-md mx-auto">
          The total on this page is only an <em>estimated</em> cost. The estimate does not take
          into account variability in license usage or other factors that may influence
          the final price, and should only be used as an estimation guide for hourly costs.
        </p>
      </div>
    </div>
  )
}
