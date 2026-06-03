'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'

interface FilesData {
  files: { fileName: string; fileSize: number; stillExists: boolean }[]
  allAvailable: boolean
  availableCount: number
  totalCount: number
}

interface EstimateData {
  frameCount:       number
  taskCount:        number
  estimatedSeconds: number | null
  estimatedCost:    number
  basedOn:          string | null
}

interface RerenderHistory {
  originalJob: { jobNumber: string; frameRange: string }
  rerenders:   { jobNumber: string; frameRange: string; createdAt: string }[]
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtSec(s: number): string {
  if (s < 60)   return `~${Math.round(s)}s`
  if (s < 3600) return `~${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
  return `~${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export default function ReRenderModal({
  jobNumber,
  jobTitle,
  originalFrames,
  onClose,
}: {
  jobNumber:      string
  jobTitle:       string
  originalFrames: string
  onClose:        () => void
}) {
  const router = useRouter()

  const [filesData,   setFilesData]   = useState<FilesData | null>(null)
  const [history,     setHistory]     = useState<RerenderHistory | null>(null)
  const [estimate,    setEstimate]    = useState<EstimateData | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(true)

  const [frameRange,    setFrameRange]    = useState('')
  const [chunkSize,     setChunkSize]     = useState(1)
  const [scoutFrames,   setScoutFrames]   = useState('')
  const [jobTitleInput, setJobTitleInput] = useState('')
  const [showOriginal,  setShowOriginal]  = useState(false)
  const [notifEmail,    setNotifEmail]    = useState(true)
  const [notifSound,    setNotifSound]    = useState(true)
  const [notifyOn,      setNotifyOn]      = useState<'BOTH' | 'SUCCESS' | 'FAILURE'>('BOTH')

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const estimateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const token = () => getToken() ?? ''

  // Load files + history
  useEffect(() => {
    const load = async () => {
      setLoadingFiles(true)
      try {
        const [fRes, hRes] = await Promise.all([
          fetch(`/api/jobs/${jobNumber}/files`, { headers: { Authorization: `Bearer ${token()}` } }),
          fetch(`/api/jobs/${jobNumber}/rerenders`, { headers: { Authorization: `Bearer ${token()}` } }),
        ])
        if (fRes.ok)  setFilesData(await fRes.json() as FilesData)
        if (hRes.ok)  setHistory(await hRes.json() as RerenderHistory)
      } catch { /* ignore */ }
      setLoadingFiles(false)
    }
    load()
  }, [jobNumber])

  // Set default title once history is loaded
  useEffect(() => {
    if (!history) return
    const n = history.rerenders.length + 1
    setJobTitleInput(`${jobTitle} [Re-render ${n}]`)
    setChunkSize(1)
  }, [history, jobTitle])

  // Live estimate when frame range changes
  const fetchEstimate = useCallback(async (frames: string, chunk: number) => {
    if (!frames.trim()) { setEstimate(null); return }
    try {
      const res = await fetch(
        `/api/jobs/${jobNumber}/estimate?frames=${encodeURIComponent(frames)}&chunk=${chunk}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      )
      if (res.ok) setEstimate(await res.json() as EstimateData)
    } catch { /* ignore */ }
  }, [jobNumber])

  const scheduleEstimate = useCallback((frames: string, chunk: number) => {
    if (estimateTimer.current) clearTimeout(estimateTimer.current)
    estimateTimer.current = setTimeout(() => fetchEstimate(frames, chunk), 400)
  }, [fetchEstimate])

  useEffect(() => {
    scheduleEstimate(frameRange, chunkSize)
  }, [frameRange, chunkSize, scheduleEstimate])

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handleSubmit = async () => {
    if (!frameRange.trim()) { setError('Enter a frame range.'); return }
    setError(''); setSubmitting(true)
    try {
      const res = await fetch(`/api/jobs/${jobNumber}/rerender`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          frame_range:   frameRange.trim(),
          chunk_size:    chunkSize,
          scout_frames:  scoutFrames.trim(),
          job_title:     jobTitleInput.trim() || undefined,
          notifications: { email: notifEmail, sound: notifSound, notify_on: notifyOn },
        }),
      })
      const data = await res.json() as { jobNumber?: string; message?: string; detail?: string }
      if (!res.ok) {
        setError(data.detail ?? data.message ?? 'Submission failed')
        return
      }
      onClose()
      router.push(`/jobs/${data.jobNumber}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  // Previously rendered ranges
  const prevRanges = history
    ? [
        { jn: history.originalJob.jobNumber, fr: history.originalJob.frameRange },
        ...history.rerenders.map(r => ({ jn: r.jobNumber, fr: r.frameRange })),
      ]
    : []

  const canSubmit = frameRange.trim().length > 0
    && (filesData === null || filesData.availableCount > 0)
    && !submitting

  const filesStatus = loadingFiles ? null : !filesData || filesData.totalCount === 0
    ? 'unknown'
    : filesData.allAvailable
      ? 'all'
      : filesData.availableCount > 0
        ? 'partial'
        : 'purged'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-[#14161c] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Re-render</h2>
            <p className="text-xs text-gray-500 mt-0.5">{jobTitle} · {jobNumber}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 -mr-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Files status */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Files on farm</p>
            {loadingFiles ? (
              <p className="text-sm text-gray-500">Checking storage…</p>
            ) : filesStatus === 'purged' ? (
              <div className="rounded-lg bg-red-950/40 border border-red-700/30 px-4 py-3">
                <p className="text-sm text-red-400 font-medium">✗ Files have been purged from storage</p>
                <p className="text-xs text-red-400/70 mt-1">
                  Original files are no longer on the farm. Open Blender and re-submit to re-upload.
                </p>
              </div>
            ) : filesStatus === 'all' ? (
              <div className="rounded-lg bg-green-950/30 border border-green-700/30 px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-green-400 font-medium">
                    ✓ All {filesData!.totalCount} file{filesData!.totalCount !== 1 ? 's' : ''} available — no upload needed
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {filesData!.files.slice(0, 5).map(f => (
                    <div key={f.fileName} className="flex items-center justify-between text-xs text-gray-400">
                      <span className="font-mono truncate max-w-xs">{f.fileName}</span>
                      {f.fileSize > 0 && <span className="ml-2 shrink-0">{fmtBytes(f.fileSize)}</span>}
                    </div>
                  ))}
                  {filesData!.files.length > 5 && (
                    <span className="text-xs text-gray-600">… and {filesData!.files.length - 5} more</span>
                  )}
                </div>
              </div>
            ) : filesStatus === 'partial' ? (
              <div className="rounded-lg bg-amber-950/30 border border-amber-700/30 px-4 py-3">
                <p className="text-sm text-amber-400 font-medium">
                  ⚠ {filesData!.availableCount} of {filesData!.totalCount} files available — {filesData!.totalCount - filesData!.availableCount} need re-upload
                </p>
              </div>
            ) : (
              <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <p className="text-sm text-gray-400">Scene file on cloud storage ✓</p>
                <p className="text-xs text-gray-600 mt-0.5">No file upload needed — files are already on the farm.</p>
              </div>
            )}
          </div>

          {/* Original settings toggle */}
          <div>
            <button type="button" onClick={() => setShowOriginal(s => !s)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
              <span>{showOriginal ? '▾' : '▶'}</span>
              <span>Original settings</span>
            </button>
            {showOriginal && (
              <div className="mt-2 rounded-lg bg-white/4 border border-white/8 px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                <div className="text-gray-500">Original frames</div>
                <div className="text-gray-300 font-mono">{originalFrames}</div>
              </div>
            )}
          </div>

          {/* New frame settings */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">New render settings</p>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Frame Range *</label>
              <input
                type="text"
                value={frameRange}
                onChange={e => setFrameRange(e.target.value)}
                placeholder="e.g. 8-9 or 8,15,20 or 8-20"
                className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
              />
              {prevRanges.length > 0 && (
                <p className="text-xs text-gray-600 mt-1.5">
                  Previously rendered:&nbsp;
                  {prevRanges.map((r, i) => (
                    <span key={r.jn}>
                      {i > 0 && ', '}
                      <span className="font-mono text-gray-500">{r.fr}</span>
                      <span className="text-gray-700"> ({r.jn})</span>
                    </span>
                  ))}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Chunk Size</label>
                <input type="number" min={1} value={chunkSize}
                  onChange={e => setChunkSize(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white focus:outline-none focus:border-blue-500/50" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Scout Frames <span className="text-gray-600">(optional)</span></label>
                <input type="text" value={scoutFrames} onChange={e => setScoutFrames(e.target.value)}
                  placeholder="e.g. fml:3"
                  className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>

            {/* Live estimate */}
            {estimate && (
              <div className="rounded-lg bg-white/4 border border-white/8 px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
                <div className="text-gray-500">Frame count</div>
                <div className="text-gray-300">{estimate.frameCount}</div>
                <div className="text-gray-500">Task count</div>
                <div className="text-gray-300">{estimate.taskCount}</div>
                {estimate.estimatedSeconds != null && (
                  <>
                    <div className="text-gray-500">Est. duration</div>
                    <div className="text-gray-300">{fmtSec(estimate.estimatedSeconds)}</div>
                  </>
                )}
                {estimate.estimatedCost > 0 && (
                  <>
                    <div className="text-gray-500">Est. cost</div>
                    <div className="text-gray-300">~${estimate.estimatedCost.toFixed(4)}</div>
                  </>
                )}
                {estimate.basedOn && (
                  <div className="col-span-2 text-gray-600 text-[10px] mt-0.5">{estimate.basedOn}</div>
                )}
              </div>
            )}
          </div>

          {/* Job title */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Job Title</label>
            <input type="text" value={jobTitleInput} onChange={e => setJobTitleInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/6 border border-white/12 text-sm text-white focus:outline-none focus:border-blue-500/50" />
          </div>

          {/* Notifications */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notifications</p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={notifEmail} onChange={e => setNotifEmail(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-500" />
                <span className="text-sm text-gray-300">Email when complete</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={notifSound} onChange={e => setNotifSound(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-500" />
                <span className="text-sm text-gray-300">Sound notification on device</span>
              </label>
              <div className="flex items-center gap-4 ml-0.5">
                {(['BOTH', 'SUCCESS', 'FAILURE'] as const).map(v => (
                  <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="rr_notify_on" value={v} checked={notifyOn === v}
                      onChange={() => setNotifyOn(v)} className="accent-blue-500" />
                    <span className="text-xs text-gray-400">
                      {v === 'BOTH' ? 'Success & failure' : v === 'SUCCESS' ? 'Success only' : 'Failure only'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? 'Submitting…' : 'Submit Re-render'}
          </button>
        </div>
      </div>
    </div>
  )
}
