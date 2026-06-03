'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MachineType {
  id: string; label: string; instance: string
  gpu_memory?: string; vcpu: number; ram_gb: number
}

interface FilesData {
  files: { fileName: string; fileSize: number; stillExists: boolean }[]
  allAvailable: boolean; availableCount: number; totalCount: number
}

interface EstimateData {
  frameCount: number; taskCount: number
  estimatedSeconds: number | null; estimatedCost: number; basedOn: string | null
}

interface RenderSettings {
  samples?: number
  resolution_x?: number; resolution_y?: number; resolution_pct?: number
  output_path?: string
  engine?: string
  cameras?: string[]; active_camera?: string
  chunk_size?: number
  instance_type?: string; machine_type?: string
  preemptible?: boolean; preemptible_retries?: number
  scout_frames?: string
  frame_range?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtSec(s: number) {
  if (s < 60)   return `~${Math.round(s)}s`
  if (s < 3600) return `~${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
  return `~${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function parseFrameSpec(spec: string): number[] {
  const out = new Set<number>()
  for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
    const dash = part.indexOf('-', part.startsWith('-') ? 1 : 0)
    if (dash > 0) {
      const a = parseInt(part.slice(0, dash), 10), b = parseInt(part.slice(dash + 1), 10)
      if (!isNaN(a) && !isNaN(b)) { for (let i = Math.min(a,b); i <= Math.max(a,b); i++) out.add(i); continue }
    }
    const n = parseInt(part, 10); if (!isNaN(n)) out.add(n)
  }
  return [...out].sort((a, b) => a - b)
}

function isValidSpec(s: string) { return s.trim().length > 0 && parseFrameSpec(s).length > 0 }

function suggestOutputPath(path: string): string | null {
  const m = path.match(/^(.*[/\\])v(\d+)([/\\]?)$/)
  if (!m) return null
  return `${m[1]}v${String(Number(m[2]) + 1).padStart(m[2].length, '0')}${m[3]}`
}

function chunkCount(frameSpec: string, chunk: number): number {
  return Math.ceil(parseFrameSpec(frameSpec).length / Math.max(1, chunk))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className={`w-full px-3 py-2 rounded-lg bg-white/6 border text-sm text-white placeholder-gray-600 focus:outline-none transition-colors ${props.className ?? 'border-white/12 focus:border-blue-500/50'}`} />
  )
}

function PresetBtn({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-white/8 text-gray-400 hover:bg-white/12 hover:text-gray-200'}`}>
      {label}
    </button>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 group cursor-pointer">
      <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{label}</span>
    </button>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ReRenderModal({
  jobNumber, jobTitle, originalFrames, onClose,
}: {
  jobNumber: string; jobTitle: string; originalFrames: string; onClose: () => void
}) {
  const router = useRouter()
  const tok = () => getToken() ?? ''

  // ── Remote data ──────────────────────────────────────────────────────────────
  const [filesData,    setFilesData]    = useState<FilesData | null>(null)
  const [origSettings, setOrigSettings] = useState<RenderSettings>({})
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([])
  const [prevRanges,   setPrevRanges]   = useState<{ jn: string; fr: string; date: string }[]>([])
  const [estimate,     setEstimate]     = useState<EstimateData | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(true)

  // ── Form state (10 settings) ──────────────────────────────────────────────
  const [frameRange,    setFrameRange]    = useState('')
  const [samples,       setSamples]       = useState<number>(512)
  const [resX,          setResX]          = useState<number>(1920)
  const [resY,          setResY]          = useState<number>(1080)
  const [resPct,        setResPct]        = useState<number>(100)
  const [outputPath,    setOutputPath]    = useState('')
  const [engine,        setEngine]        = useState<'CYCLES' | 'EEVEE'>('CYCLES')
  const [camera,        setCamera]        = useState('')
  const [chunkSize,     setChunkSize]     = useState<number>(1)
  const [instanceType,  setInstanceType]  = useState<'GPU' | 'CPU'>('GPU')
  const [machineType,   setMachineType]   = useState('')
  const [preemptible,   setPreemptible]   = useState(true)
  const [preemptRetries, setPreemptRetries] = useState(1)
  const [scoutFrames,   setScoutFrames]   = useState('')
  const [jobTitleInput, setJobTitleInput] = useState('')
  const [notifEmail,    setNotifEmail]    = useState(true)
  const [notifSound,    setNotifSound]    = useState(true)
  const [notifyOn,      setNotifyOn]      = useState<'BOTH' | 'SUCCESS' | 'FAILURE'>('BOTH')

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Load remote data ──────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoadingFiles(true)
      const headers = { Authorization: `Bearer ${tok()}` }
      const [fRes, hRes, mRes, jRes] = await Promise.all([
        fetch(`/api/jobs/${jobNumber}/files`, { headers }),
        fetch(`/api/jobs/${jobNumber}/rerenders`, { headers }),
        fetch('/api/machine-types'),
        fetch(`/api/jobs?jobNumber=${jobNumber}`, { headers }),
      ])

      if (fRes.ok)  setFilesData(await fRes.json() as FilesData)
      if (mRes.ok)  setMachineTypes(await mRes.json() as MachineType[])

      if (jRes.ok) {
        const job = await jRes.json() as Record<string, unknown>
        const rs  = (job.renderSettings ?? job.render_settings ?? job.manifest ?? {}) as RenderSettings
        setOrigSettings(rs)
        setSamples(Number(rs.samples ?? job.samples ?? 512))
        setResX(Number(rs.resolution_x ?? 1920))
        setResY(Number(rs.resolution_y ?? 1080))
        setResPct(Number(rs.resolution_pct ?? 100))
        setOutputPath(String(rs.output_path ?? job.outputPath ?? ''))
        setEngine((rs.engine ?? 'CYCLES') as 'CYCLES' | 'EEVEE')
        setCamera(String(rs.active_camera ?? ''))
        setChunkSize(Number(rs.chunk_size ?? 1))
        const iType = String(rs.instance_type ?? 'GPU') as 'GPU' | 'CPU'
        setInstanceType(iType)
        setMachineType(String(rs.machine_type ?? ''))
        setPreemptible(rs.preemptible !== false)
        setPreemptRetries(Number(rs.preemptible_retries ?? 1))
        setScoutFrames(String(rs.scout_frames ?? ''))
      }

      if (hRes.ok) {
        const h = await hRes.json() as {
          originalJob: { jobNumber: string; frameRange: string; createdAt: string }
          rerenders: { jobNumber: string; frameRange: string; createdAt: string }[]
          totalRerenders: number
        }
        const n = h.totalRerenders + 1
        setJobTitleInput(`${jobTitle} [Re-render ${n}]`)
        setPrevRanges([
          { jn: h.originalJob.jobNumber, fr: h.originalJob.frameRange ?? originalFrames, date: h.originalJob.createdAt ?? '' },
          ...h.rerenders.map(r => ({ jn: r.jobNumber, fr: r.frameRange, date: r.createdAt })),
        ])
      } else {
        setJobTitleInput(`${jobTitle} [Re-render 1]`)
      }

      setLoadingFiles(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobNumber])

  // ── Default machine type when type changes ────────────────────────────────
  useEffect(() => {
    const matches = filteredMachines
    if (matches.length && !matches.find(m => m.instance === machineType || m.id === machineType)) {
      setMachineType(matches[0].instance || matches[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceType, machineTypes])

  const filteredMachines = useMemo(() =>
    machineTypes.filter(m => {
      const hasGpu = m.gpu_memory && m.gpu_memory !== ''
      return instanceType === 'GPU' ? hasGpu : !hasGpu
    }),
  [machineTypes, instanceType])

  const selectedMachine = filteredMachines.find(m => m.instance === machineType || m.id === machineType)

  // ── Live estimate ─────────────────────────────────────────────────────────
  const fetchEstimate = useCallback(async (frames: string, chunk: number) => {
    if (!frames.trim() || !isValidSpec(frames)) { setEstimate(null); return }
    try {
      const res = await fetch(
        `/api/jobs/${jobNumber}/estimate?frames=${encodeURIComponent(frames)}&chunk=${chunk}`,
        { headers: { Authorization: `Bearer ${tok()}` } }
      )
      if (res.ok) setEstimate(await res.json() as EstimateData)
    } catch { /* ignore */ }
  }, [jobNumber])

  useEffect(() => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current)
    estimateTimer.current = setTimeout(() => fetchEstimate(frameRange, chunkSize), 400)
  }, [frameRange, chunkSize, fetchEstimate])

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // ── Frame range validation ─────────────────────────────────────────────
  const frameValid   = isValidSpec(frameRange)
  const frameInvalid = frameRange.trim().length > 0 && !frameValid
  const overlapJobs  = useMemo(() => {
    if (!frameValid) return []
    const newSet = new Set(parseFrameSpec(frameRange))
    return prevRanges.filter(p => parseFrameSpec(p.fr).some(f => newSet.has(f)))
  }, [frameRange, frameValid, prevRanges])

  // ── Change diff ───────────────────────────────────────────────────────────
  type DiffEntry = { label: string; from: string; to: string }
  const diffs = useMemo((): DiffEntry[] => {
    const rs = origSettings
    const d: DiffEntry[] = []
    if (frameRange.trim() && frameRange !== (rs.frame_range ?? originalFrames))
      d.push({ label: 'Frame range', from: rs.frame_range ?? originalFrames, to: frameRange })
    if (samples !== Number(rs.samples ?? 512))
      d.push({ label: 'Samples', from: String(rs.samples ?? 512), to: String(samples) })
    if (resX !== Number(rs.resolution_x ?? 1920) || resY !== Number(rs.resolution_y ?? 1080) || resPct !== Number(rs.resolution_pct ?? 100))
      d.push({ label: 'Resolution', from: `${rs.resolution_x ?? 1920}×${rs.resolution_y ?? 1080} @${rs.resolution_pct ?? 100}%`, to: `${resX}×${resY} @${resPct}%` })
    if (outputPath !== String(rs.output_path ?? ''))
      d.push({ label: 'Output path', from: rs.output_path ?? '—', to: outputPath || '—' })
    if (engine !== (rs.engine ?? 'CYCLES'))
      d.push({ label: 'Render engine', from: rs.engine ?? 'CYCLES', to: engine })
    if (camera !== (rs.active_camera ?? ''))
      d.push({ label: 'Camera', from: rs.active_camera ?? '—', to: camera || '—' })
    if (chunkSize !== Number(rs.chunk_size ?? 1))
      d.push({ label: 'Chunk size', from: String(rs.chunk_size ?? 1), to: String(chunkSize) })
    if (machineType && machineType !== (rs.machine_type ?? ''))
      d.push({ label: 'Machine', from: rs.machine_type ?? '—', to: machineType })
    if (preemptible !== (rs.preemptible !== false))
      d.push({ label: 'Preemptible', from: String(rs.preemptible !== false), to: String(preemptible) })
    if (scoutFrames !== (rs.scout_frames ?? ''))
      d.push({ label: 'Scout frames', from: rs.scout_frames || '—', to: scoutFrames || '—' })
    return d
  }, [origSettings, frameRange, samples, resX, resY, resPct, outputPath, engine, camera, chunkSize, machineType, preemptible, scoutFrames, originalFrames])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    const rs = origSettings
    setFrameRange('')
    setSamples(Number(rs.samples ?? 512))
    setResX(Number(rs.resolution_x ?? 1920))
    setResY(Number(rs.resolution_y ?? 1080))
    setResPct(Number(rs.resolution_pct ?? 100))
    setOutputPath(String(rs.output_path ?? ''))
    setEngine((rs.engine ?? 'CYCLES') as 'CYCLES' | 'EEVEE')
    setCamera(String(rs.active_camera ?? ''))
    setChunkSize(Number(rs.chunk_size ?? 1))
    setPreemptible(rs.preemptible !== false)
    setPreemptRetries(Number(rs.preemptible_retries ?? 1))
    setScoutFrames(String(rs.scout_frames ?? ''))
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!frameValid) { setError('Enter a valid frame range.'); return }
    setError(''); setSubmitting(true)
    try {
      const rs = origSettings
      const body: Record<string, unknown> = {
        frame_range: frameRange.trim(),
        job_title:   jobTitleInput.trim() || undefined,
        notifications: { email: notifEmail, sound: notifSound, notify_on: notifyOn },
      }
      if (samples !== Number(rs.samples ?? 512))           body.samples = samples
      if (resX !== Number(rs.resolution_x ?? 1920))        body.resolution_x = resX
      if (resY !== Number(rs.resolution_y ?? 1080))        body.resolution_y = resY
      if (resPct !== Number(rs.resolution_pct ?? 100))     body.resolution_pct = resPct
      if (outputPath !== String(rs.output_path ?? ''))     body.output_path = outputPath
      if (engine !== (rs.engine ?? 'CYCLES'))              body.engine = engine
      if (camera !== (rs.active_camera ?? ''))             body.camera = camera
      if (chunkSize !== Number(rs.chunk_size ?? 1))        body.chunk_size = chunkSize
      if (instanceType !== (rs.instance_type ?? 'GPU'))    body.instance_type = instanceType
      if (machineType !== (rs.machine_type ?? ''))         body.machine_type = machineType
      if (preemptible !== (rs.preemptible !== false))      body.preemptible = preemptible
      if (preemptRetries !== Number(rs.preemptible_retries ?? 1)) body.preemptible_retries = preemptRetries
      if (scoutFrames !== (rs.scout_frames ?? ''))         body.scout_frames = scoutFrames

      const res = await fetch(`/api/jobs/${jobNumber}/rerender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { jobNumber?: string; message?: string; detail?: string }
      if (!res.ok) { setError(data.detail ?? data.message ?? 'Submission failed'); return }
      onClose()
      router.push(`/jobs/${data.jobNumber}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Files status ───────────────────────────────────────────────────────────
  const filesOk = !filesData || filesData.availableCount > 0
  const canSubmit = frameValid && filesOk && !submitting

  const cameras = origSettings.cameras ?? (origSettings.active_camera ? [origSettings.active_camera] : [])
  const outputSuggestion = outputPath ? suggestOutputPath(outputPath) : null
  const tasks = frameRange && frameValid ? chunkCount(frameRange, chunkSize) : (estimate?.taskCount ?? 0)
  const scoutParsed = scoutFrames.trim() && frameValid
    ? parseFrameSpec(frameRange).slice(0, 3).join(', ')
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#13151b] border border-white/10 rounded-xl shadow-2xl w-full max-w-[640px] max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">Re-render — {jobTitle}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">{jobNumber}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-300 transition-colors p-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 text-sm">

          {/* ── FILES STATUS ─────────────────────────────────────────────── */}
          {loadingFiles ? (
            <div className="text-xs text-gray-600 py-1">Checking files on farm…</div>
          ) : !filesData || filesData.totalCount === 0 ? (
            <div className="rounded-lg bg-white/4 border border-white/10 px-4 py-3">
              <p className="text-xs text-gray-400 font-medium">✓ Scene file on cloud storage — no upload needed</p>
            </div>
          ) : filesData.allAvailable ? (
            <div className="rounded-lg bg-green-950/30 border border-green-700/25 px-4 py-2.5">
              <p className="text-xs text-green-400 font-medium mb-1.5">
                ✓ {filesData.totalCount} file{filesData.totalCount !== 1 ? 's' : ''} available on farm — no upload needed
              </p>
              <div className="flex flex-col gap-0.5">
                {filesData.files.slice(0, 4).map(f => (
                  <div key={f.fileName} className="flex items-center justify-between text-[11px] text-gray-500">
                    <span className="font-mono truncate max-w-[280px]">{f.fileName}</span>
                    {f.fileSize > 0 && <span className="ml-2 shrink-0">{fmtBytes(f.fileSize)}</span>}
                  </div>
                ))}
                {filesData.files.length > 4 && <span className="text-[11px] text-gray-700">… and {filesData.files.length - 4} more</span>}
              </div>
            </div>
          ) : filesData.availableCount === 0 ? (
            <div className="rounded-lg bg-red-950/30 border border-red-700/30 px-4 py-3">
              <p className="text-xs text-red-400 font-medium">✗ Files no longer on farm — re-submit from Blender to re-upload</p>
            </div>
          ) : (
            <div className="rounded-lg bg-amber-950/25 border border-amber-700/25 px-4 py-2.5">
              <p className="text-xs text-amber-400 font-medium">
                ⚠ {filesData.availableCount} of {filesData.totalCount} files available
              </p>
            </div>
          )}

          {/* ── 10 SETTINGS — 2-column grid ─────────────────────────────── */}
          <div className="flex flex-col gap-3">

            {/* ── 1. FRAME RANGE — full width ──────────────────────────── */}
            <div className="col-span-2">
              <Label required>Frame Range</Label>
              <Input
                type="text" value={frameRange} onChange={e => setFrameRange(e.target.value)}
                placeholder="e.g. 8-20 or 1,5,10 or 1-100"
                className={`border ${frameInvalid ? 'border-red-500/50 focus:border-red-500' : frameValid ? 'border-green-600/50 focus:border-green-500' : 'border-white/12 focus:border-blue-500/50'}`}
              />
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  {frameInvalid && <span className="text-[11px] text-red-400">✗ Invalid frame spec</span>}
                  {frameValid && <span className="text-[11px] text-green-400">✓ Valid — {parseFrameSpec(frameRange).length} frames</span>}
                  {prevRanges.length > 0 && (
                    <span className="text-[11px] text-gray-600">
                      Previously rendered: {prevRanges.map((r, i) => (
                        <span key={r.jn}>{i > 0 && ', '}<span className="font-mono text-gray-500">{r.fr}</span> ({r.jn})</span>
                      ))}
                    </span>
                  )}
                  {overlapJobs.length > 0 && (
                    <span className="text-[11px] text-amber-400">
                      ⚠ Frames overlap with {overlapJobs.map(j => j.jn).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── 2-column grid for settings 2-10 ─────────────────────── */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">

              {/* ── 2. SAMPLES ──────────────────────────────────────────── */}
              <div>
                <Label>Render Samples</Label>
                <Input type="number" min={1} value={samples} onChange={e => setSamples(Number(e.target.value))} />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[32, 64, 128, 256, 512, 1024, 2048].map(n => (
                    <PresetBtn key={n} label={String(n)} active={samples === n} onClick={() => setSamples(n)} />
                  ))}
                </div>
                {samples < 64 && <p className="text-[11px] text-amber-400 mt-1">Low samples — may be noisy</p>}
                {samples > 1024 && <p className="text-[11px] text-blue-400 mt-1">High samples — longer render</p>}
                {origSettings.samples != null && (
                  <p className="text-[11px] text-gray-600 mt-0.5">Original: {origSettings.samples}</p>
                )}
              </div>

              {/* ── 4. OUTPUT PATH ──────────────────────────────────────── */}
              <div>
                <Label>Output Path</Label>
                <Input type="text" value={outputPath} onChange={e => setOutputPath(e.target.value)}
                  placeholder="/path/to/output/v002/" />
                {outputSuggestion && outputSuggestion !== outputPath && (
                  <button type="button" onClick={() => setOutputPath(outputSuggestion)}
                    className="text-[11px] text-blue-400 hover:text-blue-300 mt-1 flex items-center gap-1">
                    💡 {outputSuggestion}
                  </button>
                )}
                {origSettings.output_path && origSettings.output_path !== outputPath && (
                  <p className="text-[11px] text-gray-600 mt-0.5 truncate" title={origSettings.output_path}>
                    Original: {origSettings.output_path}
                  </p>
                )}
              </div>

              {/* ── 3. RESOLUTION ───────────────────────────────────────── */}
              <div className="col-span-2">
                <Label>Resolution</Label>
                <div className="flex items-center gap-2">
                  <Input type="number" min={1} value={resX} onChange={e => setResX(Number(e.target.value))} placeholder="W" />
                  <span className="text-gray-600 shrink-0">×</span>
                  <Input type="number" min={1} value={resY} onChange={e => setResY(Number(e.target.value))} placeholder="H" />
                  <span className="text-gray-600 shrink-0">@</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input type="number" min={1} max={1000} value={resPct} onChange={e => setResPct(Number(e.target.value))} className="w-16 border-white/12 focus:border-blue-500/50" />
                    <span className="text-gray-500 text-xs">%</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <PresetBtn label="4K"  active={resX === 3840 && resY === 2160 && resPct === 100} onClick={() => { setResX(3840); setResY(2160); setResPct(100) }} />
                  <PresetBtn label="2K"  active={resX === 2048 && resY === 1080 && resPct === 100} onClick={() => { setResX(2048); setResY(1080); setResPct(100) }} />
                  <PresetBtn label="FHD" active={resX === 1920 && resY === 1080 && resPct === 100} onClick={() => { setResX(1920); setResY(1080); setResPct(100) }} />
                  <PresetBtn label="HD"  active={resX === 1280 && resY === 720  && resPct === 100} onClick={() => { setResX(1280); setResY(720);  setResPct(100) }} />
                  <PresetBtn label="50%" active={resPct === 50}  onClick={() => setResPct(50)} />
                  <PresetBtn label="25%" active={resPct === 25}  onClick={() => setResPct(25)} />
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  Effective: {Math.round(resX * resPct / 100)} × {Math.round(resY * resPct / 100)} px
                </p>
              </div>

              {/* ── 5. RENDER ENGINE ────────────────────────────────────── */}
              <div>
                <Label>Render Engine</Label>
                <div className="flex rounded-lg overflow-hidden border border-white/12">
                  {(['CYCLES', 'EEVEE'] as const).map(e => (
                    <button key={e} type="button" onClick={() => setEngine(e)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${engine === e ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                      {e === 'CYCLES' ? 'Cycles' : 'EEVEE'}
                    </button>
                  ))}
                </div>
                {engine === 'EEVEE' && (
                  <p className="text-[11px] text-blue-400 mt-1">ℹ Faster but lower quality. Requires GPU.</p>
                )}
                {engine !== origSettings.engine && origSettings.engine && (
                  <p className="text-[11px] text-amber-400 mt-1">⚠ Different engine may affect results</p>
                )}
              </div>

              {/* ── 6. CAMERA ───────────────────────────────────────────── */}
              <div>
                <Label>Camera</Label>
                {cameras.length > 1 ? (
                  <select title="Camera" value={camera} onChange={e => setCamera(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white focus:outline-none focus:border-blue-500/50">
                    {cameras.map(c => (
                      <option key={c} value={c} className="bg-[#1a1d23]">
                        {c}{c === origSettings.active_camera ? ' (original)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-2 rounded-lg bg-white/4 border border-white/8 text-sm text-gray-400">
                    {camera || 'Not specified'}
                  </div>
                )}
                {cameras.length > 1 && (
                  <p className="text-[11px] text-gray-600 mt-1">From original .blend file</p>
                )}
              </div>

              {/* ── 7. CHUNK SIZE ───────────────────────────────────────── */}
              <div>
                <Label>Chunk Size</Label>
                <div className="flex items-center gap-3">
                  <Input type="number" min={1} max={800} value={chunkSize}
                    onChange={e => setChunkSize(Math.max(1, Number(e.target.value)))}
                    className="w-20 border-white/12 focus:border-blue-500/50" />
                  <input aria-label="Chunk size slider" type="range" min={1} max={50} value={chunkSize}
                    onChange={e => setChunkSize(Number(e.target.value))}
                    className="flex-1 accent-blue-500" />
                </div>
                <p className="text-[11px] text-gray-600 mt-1">
                  {tasks > 0 ? `= ${tasks} task${tasks !== 1 ? 's' : ''}` : ''}
                  {chunkSize === 1 ? ' · max parallelism' : chunkSize <= 5 ? ' · good for complex scenes' : chunkSize <= 20 ? ' · fewer, longer tasks' : ' · minimal parallelism'}
                </p>
              </div>

              {/* ── 8. MACHINE ──────────────────────────────────────────── */}
              <div>
                <Label>Machine</Label>
                <div className="flex gap-2">
                  <select title="Instance type" value={instanceType} onChange={e => setInstanceType(e.target.value as 'GPU' | 'CPU')}
                    className="w-20 px-2 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white focus:outline-none">
                    <option value="GPU" className="bg-[#1a1d23]">GPU</option>
                    <option value="CPU" className="bg-[#1a1d23]">CPU</option>
                  </select>
                  <select title="Machine type" value={machineType} onChange={e => setMachineType(e.target.value)}
                    className="flex-1 px-2 py-2 rounded-lg bg-white/6 border border-white/12 text-xs text-white focus:outline-none min-w-0 truncate">
                    {filteredMachines.map(m => (
                      <option key={m.id} value={m.instance || m.id} className="bg-[#1a1d23]">{m.label}</option>
                    ))}
                  </select>
                </div>
                {selectedMachine && (
                  <p className="text-[11px] text-gray-600 mt-1">
                    {selectedMachine.vcpu} cores · {selectedMachine.ram_gb} GB RAM
                    {selectedMachine.gpu_memory ? ` · ${selectedMachine.gpu_memory} GPU` : ''}
                  </p>
                )}
                {instanceType === 'CPU' && engine === 'CYCLES' && (
                  <p className="text-[11px] text-amber-400 mt-0.5">⚠ CPU Cycles is slow — GPU recommended</p>
                )}
              </div>

              {/* ── 9. PREEMPTIBLE ──────────────────────────────────────── */}
              <div>
                <Label>Preemptible (spot)</Label>
                <Toggle checked={preemptible} onChange={setPreemptible} label="Use spot instances" />
                {preemptible ? (
                  <>
                    <p className="text-[11px] text-green-400 mt-1.5">~60-80% cheaper than on-demand</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-gray-500">Retries:</span>
                      <Input type="number" min={0} max={5} value={preemptRetries}
                        onChange={e => setPreemptRetries(Number(e.target.value))}
                        className="w-14 border-white/12 focus:border-blue-500/50 py-1 text-xs" />
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-amber-400 mt-1.5">On-demand — costs more, never interrupted</p>
                )}
              </div>

              {/* ── 10. SCOUT FRAMES ────────────────────────────────────── */}
              <div>
                <Label>Scout Frames</Label>
                <Input type="text" value={scoutFrames} onChange={e => setScoutFrames(e.target.value)}
                  placeholder="e.g. fml:3 or auto:3 (optional)" />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['fml:3', 'auto:3', 'auto:5'].map(p => (
                    <PresetBtn key={p} label={p} active={scoutFrames === p} onClick={() => setScoutFrames(p)} />
                  ))}
                  <PresetBtn label="None" active={scoutFrames === ''} onClick={() => setScoutFrames('')} />
                </div>
                {scoutFrames.trim() && scoutParsed ? (
                  <p className="text-[11px] text-gray-600 mt-1">Scout: {scoutParsed}… | {Math.min(3, tasks)} start now, {Math.max(0, tasks - 3)} held</p>
                ) : tasks > 0 ? (
                  <p className="text-[11px] text-gray-600 mt-1">All {tasks} task{tasks !== 1 ? 's' : ''} start immediately</p>
                ) : null}
              </div>

            </div>
          </div>

          {/* ── JOB TITLE ─────────────────────────────────────────────────── */}
          <div>
            <Label>Job Title</Label>
            <Input type="text" value={jobTitleInput} onChange={e => setJobTitleInput(e.target.value)} />
          </div>

          {/* ── CHANGE DIFF ───────────────────────────────────────────────── */}
          {diffs.length > 0 && (
            <div className="rounded-lg bg-white/4 border border-white/8 px-4 py-3">
              <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Changes from {jobNumber}</p>
              <div className="flex flex-col gap-1">
                {diffs.map(d => (
                  <div key={d.label} className="flex items-center gap-2 text-xs">
                    <span className="text-green-500 shrink-0">✓</span>
                    <span className="text-gray-500 w-24 shrink-0">{d.label}:</span>
                    <span className="text-gray-600 font-mono">{d.from}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-gray-300 font-mono">{d.to}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── COST ESTIMATE ─────────────────────────────────────────────── */}
          {estimate ? (
            <div className="rounded-lg bg-white/4 border border-white/8 px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
              <div className="text-gray-500">Frames</div>  <div className="text-gray-300">{estimate.frameCount}</div>
              <div className="text-gray-500">Tasks</div>   <div className="text-gray-300">{estimate.taskCount}</div>
              {estimate.estimatedSeconds != null && (
                <><div className="text-gray-500">Est. time</div><div className="text-gray-300">{fmtSec(estimate.estimatedSeconds)}</div></>
              )}
              {estimate.estimatedCost > 0 && (
                <><div className="text-gray-500">Est. cost</div><div className="text-gray-300">~${estimate.estimatedCost.toFixed(4)}</div></>
              )}
              {estimate.basedOn && (
                <div className="col-span-2 text-gray-700 text-[10px] mt-0.5">{estimate.basedOn}</div>
              )}
            </div>
          ) : frameValid && (
            <p className="text-[11px] text-gray-600">Estimate unavailable — no previous render data for this scene.</p>
          )}

          {/* ── NOTIFICATIONS ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-5 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-400">
              <input type="checkbox" checked={notifEmail} onChange={e => setNotifEmail(e.target.checked)} className="accent-blue-500" />
              Email
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-400">
              <input type="checkbox" checked={notifSound} onChange={e => setNotifSound(e.target.checked)} className="accent-blue-500" />
              Sound
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Notify on:</span>
              <select title="Notify on" value={notifyOn} onChange={e => setNotifyOn(e.target.value as typeof notifyOn)}
                className="px-2 py-1 rounded bg-white/6 border border-white/12 text-xs text-gray-300 focus:outline-none">
                <option value="BOTH" className="bg-[#1a1d23]">Success and failure</option>
                <option value="SUCCESS" className="bg-[#1a1d23]">Success only</option>
                <option value="FAILURE" className="bg-[#1a1d23]">Failure only</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/10 shrink-0 gap-3">
          <button type="button" onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={reset}
              className="px-3.5 py-2 rounded-lg text-sm border border-white/12 text-gray-400 hover:border-white/20 hover:text-gray-200 transition-colors">
              Reset
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting ? 'Submitting…' : <>Submit Re-render <span>→</span></>}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
