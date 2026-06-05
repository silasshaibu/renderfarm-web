'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getToken } from '@/lib/auth'

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function apiFetch(path: string, method = 'GET', body?: object) {
  const token = getToken() ?? ''
  const res   = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(d.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// Derive a clean display name from an email's local part.
// e.g. "silasshaibu2@gmail.com" -> "Silasshaibu", "jane.doe@x.com" -> "Jane Doe"
export function deriveDisplayName(email: string): string {
  if (!email) return '—'
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[0-9]+$/g, '')          // strip trailing digits
  const parts = cleaned.split(/[._-]+/).filter(Boolean)  // split on separators
  if (parts.length === 0) return '—'
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Session {
  id: number
  ip: string
  userAgent: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  isCurrent: boolean
  source: 'dashboard' | 'addon' | 'api'
}

function SourceBadge({ source }: { source: Session['source'] }) {
  const styles: Record<string, string> = {
    dashboard: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
    addon:     'bg-purple-900/40 text-purple-300 border-purple-700/40',
    api:       'bg-gray-700/40 text-gray-400 border-gray-600/40',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${styles[source] ?? styles.api}`}>
      {source}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Card wrapper
// ---------------------------------------------------------------------------
function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`calc-card ${className}`}>
      <h2 className="text-sm font-semibold text-gray-300 mb-4 pb-3 border-b border-white/10">{title}</h2>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Read-only field
// ---------------------------------------------------------------------------
function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</span>
      <span className="text-sm text-gray-200 py-2 px-3 rounded bg-white/5 border border-white/10 min-h-[38px] flex items-center">
        {value || <span className="text-gray-600 italic">—</span>}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editable field — click Edit to reveal an input, Save persists via callback
// ---------------------------------------------------------------------------
function EditableField({
  label, value, placeholder, onSave,
}: {
  label: string
  value: string
  placeholder?: string
  onSave: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const [saving,  setSaving]  = useState(false)

  const begin = () => { setDraft(value === '—' ? '' : value); setEditing(true) }
  const cancel = () => { setEditing(false) }
  const save = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try { await onSave(draft.trim()); setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 w-20 shrink-0">{label}</span>
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          autoFocus
          className="flex-1 text-sm text-gray-100 py-1 px-2 rounded bg-white/5 border border-blue-500/50 outline-none focus:border-blue-500"
        />
        <button type="button" onClick={save} disabled={saving || !draft.trim()}
          className="text-xs font-medium px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors">
          {saving ? '…' : 'Save'}
        </button>
        <button type="button" onClick={cancel}
          className="text-xs px-1 py-1 rounded text-gray-400 hover:text-gray-200 transition-colors">Cancel</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500 w-20 shrink-0">{label}</span>
      <span className="text-sm text-gray-200">{value || <span className="text-gray-600 italic">—</span>}</span>
      <button type="button" onClick={begin}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto">
        Edit
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// API Key modal
// ---------------------------------------------------------------------------
function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [key,          setKey]         = useState('')
  const [loading,      setLoading]     = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [revealed,     setRevealed]    = useState(false)
  const [copied,       setCopied]      = useState(false)
  const [err,          setErr]         = useState('')
  const [confirmed,    setConfirmed]   = useState(false)

  useEffect(() => {
    apiFetch('/api/profile/api-key')
      .then(d => setKey((d as { key: string }).key))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleRegenerate = async () => {
    if (!confirmed) { setConfirmed(true); return }
    setRegenerating(true); setErr('')
    try {
      const d = await apiFetch('/api/profile/api-key', 'POST') as { key: string }
      setKey(d.key); setRevealed(true); setConfirmed(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="calc-card w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">API Key</h3>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">&times;</button>
        </div>

        {loading && <p className="text-gray-500 text-sm text-center py-6">Loading…</p>}
        {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

        {!loading && key && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500">
              Use this key to authenticate with the Renderfarm API and CLI tools.
              Keep it secret — do not commit it to version control.
            </p>

            {/* Key display */}
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-xs text-gray-300 bg-white/5 border border-white/10 rounded px-3 py-2 truncate min-w-0">
                {revealed ? key : '•'.repeat(48)}
              </div>
              <button type="button" onClick={() => setRevealed(r => !r)}
                className="shrink-0 px-3 py-2 rounded text-xs text-gray-400 border border-white/10 hover:text-white hover:border-white/20 transition-colors">
                {revealed ? 'Hide' : 'Reveal'}
              </button>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={handleCopy}
                className="flex-1 px-3 py-2 rounded text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors">
                {copied ? '✓ Copied' : 'Copy Key'}
              </button>
              <button type="button" onClick={handleRegenerate} disabled={regenerating}
                className={`flex-1 px-3 py-2 rounded text-xs font-medium transition-colors ${
                  confirmed
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'text-gray-400 border border-white/10 hover:text-white hover:border-white/20'
                }`}>
                {regenerating ? 'Regenerating…' : confirmed ? 'Confirm — this invalidates the old key' : 'Regenerate'}
              </button>
            </div>

            {confirmed && (
              <p className="text-xs text-amber-400 text-center">
                Regenerating will invalidate the current key. Click again to confirm.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MFA Section
// ---------------------------------------------------------------------------
function MfaSection() {
  const [status,  setStatus]  = useState<'loading' | 'enabled' | 'setup' | 'verify' | 'backup'>('loading')
  const [qr,      setQr]      = useState('')
  const [secret,  setSecret]  = useState('')
  const [code,    setCode]    = useState('')
  const [backup,  setBackup]  = useState<string[]>([])
  const [err,     setErr]     = useState('')
  const [saving,  setSaving]  = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  const loadMfa = useCallback(async () => {
    setStatus('loading')
    try {
      const d = await apiFetch('/api/profile/mfa') as { enabled: boolean; qr?: string; secret?: string }
      if (d.enabled) {
        setStatus('enabled')
      } else {
        setQr(d.qr ?? ''); setSecret(d.secret ?? ''); setStatus('setup')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load MFA status')
      setStatus('setup')
    }
  }, [])

  useEffect(() => { loadMfa() }, [loadMfa])

  const handleVerify = async () => {
    setErr(''); setSaving(true)
    try {
      const d = await apiFetch('/api/profile/mfa', 'POST', { code }) as { backupCodes: string[] }
      setBackup(d.backupCodes); setStatus('backup')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDisable = async () => {
    if (!confirmDisable) { setConfirmDisable(true); return }
    setDisabling(true)
    try {
      await apiFetch('/api/profile/mfa', 'DELETE')
      setStatus('setup'); setConfirmDisable(false); loadMfa()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setDisabling(false)
    }
  }

  return (
    <Card title="Multi-Factor Authentication (MFA)">
      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

      {status === 'loading' && (
        <p className="text-gray-500 text-sm">Loading…</p>
      )}

      {status === 'enabled' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            <span className="text-sm text-green-400 font-medium">MFA is enabled</span>
          </div>
          <p className="text-sm text-gray-500">
            Your account is protected with a TOTP authenticator app.
          </p>
          <div>
            <button type="button" onClick={handleDisable} disabled={disabling}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                confirmDisable
                  ? 'bg-red-700 hover:bg-red-600 text-white'
                  : 'text-red-400 border border-red-900/50 hover:bg-red-900/20'
              }`}>
              {disabling ? 'Disabling…' : confirmDisable ? 'Click again to confirm' : 'Disable MFA'}
            </button>
          </div>
        </div>
      )}

      {status === 'setup' && (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-gray-400">
            Protect your account with a time-based one-time password (TOTP) authenticator app
            like Google Authenticator or Authy.
          </p>
          <div className="flex gap-6 items-start flex-wrap">
            {qr && (
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="MFA QR code" className="w-40 h-40 rounded bg-white p-2" />
              </div>
            )}
            <div className="flex flex-col gap-3 min-w-0">
              <div>
                <p className="text-xs text-gray-500 mb-1">Or enter this key manually:</p>
                <p className="font-mono text-xs text-gray-300 bg-white/5 border border-white/10 rounded px-3 py-2 break-all">
                  {secret}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500">Enter the 6-digit code from your app to verify:</p>
                <div className="flex gap-2">
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && code.length === 6 && handleVerify()}
                    placeholder="000000"
                    className="calc-input px-3 py-2 w-32 text-center font-mono tracking-widest text-lg"
                  />
                  <button type="button" onClick={handleVerify} disabled={saving || code.length !== 6}
                    className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors">
                    {saving ? 'Verifying…' : 'Enable MFA'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {status === 'backup' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block"></span>
            <span className="text-sm text-green-400 font-medium">MFA enabled successfully</span>
          </div>
          <div className="bg-amber-900/20 border border-amber-700/40 rounded p-4">
            <p className="text-sm text-amber-300 font-medium mb-2">Save your backup codes</p>
            <p className="text-xs text-amber-400/80 mb-3">
              Store these somewhere safe. Each code can only be used once if you lose access to your authenticator.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {backup.map((c, i) => (
                <span key={i} className="font-mono text-xs text-amber-200 bg-amber-900/30 rounded px-2 py-1 text-center">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setStatus('enabled')}
            className="self-start px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
            Done
          </button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Notification Preferences section
// ---------------------------------------------------------------------------
interface NotifPrefs {
  notifyEmail: boolean
  notifyJobCompleted: boolean
  notifyJobFailed: boolean
  notifyWeeklyReport: boolean
  notifyOn: 'BOTH' | 'SUCCESS' | 'FAILURE'
}

function NotificationsSection() {
  const [prefs,   setPrefs]   = useState<NotifPrefs | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => {
    apiFetch('/api/profile/notifications')
      .then(d => setPrefs(d as NotifPrefs))
      .catch(() => null)
  }, [])

  const save = async () => {
    if (!prefs) return
    setSaving(true); setSaved(false); setErr('')
    try {
      await apiFetch('/api/profile/notifications', 'PATCH', prefs)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (key: keyof NotifPrefs) =>
    setPrefs(p => p ? { ...p, [key]: !p[key] } : p)

  if (!prefs) return null

  return (
    <Card title="Notification Preferences">
      <p className="text-xs text-gray-500 mb-4">
        Set your default notification settings. These pre-fill the notification options in the Blender submitter for each new job.
      </p>

      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

      <div className="flex flex-col gap-3">
        {/* Master email toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={prefs.notifyEmail}
            onChange={() => toggle('notifyEmail')}
            className="w-4 h-4 accent-blue-500 rounded" />
          <div>
            <span className="text-sm text-gray-200">Email notifications</span>
            <p className="text-xs text-gray-500 mt-0.5">Receive emails when render jobs complete</p>
          </div>
        </label>

        {prefs.notifyEmail && (
          <div className="pl-7 flex flex-col gap-2 border-l border-white/10 ml-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={prefs.notifyJobCompleted}
                onChange={() => toggle('notifyJobCompleted')}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-gray-300">Job completed successfully</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={prefs.notifyJobFailed}
                onChange={() => toggle('notifyJobFailed')}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-gray-300">Job failed</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={prefs.notifyWeeklyReport}
                onChange={() => toggle('notifyWeeklyReport')}
                className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-gray-300">Weekly usage report</span>
            </label>

            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">Default notify trigger:</p>
              <div className="flex flex-col gap-1.5">
                {([['BOTH', 'Success and failure'], ['SUCCESS', 'Success only'], ['FAILURE', 'Failure only']] as const).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="radio" name="notify_on" value={val}
                      checked={prefs.notifyOn === val}
                      onChange={() => setPrefs(p => p ? { ...p, notifyOn: val } : p)}
                      className="accent-blue-500" />
                    <span className="text-sm text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-white/10 flex items-center gap-3">
          <button type="button" onClick={save} disabled={saving}
            className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
          {saved && <span className="text-xs text-green-400">Saved</span>}
        </div>
      </div>
    </Card>
  )
}

// Refer a Friend section
// ---------------------------------------------------------------------------
function ReferralSection() {
  const [data, setData] = useState<{
    link: string; code: string; pending: number; credited: number; earned: number
    reward: number; qualifyCharge: number
  } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiFetch('/api/profile/referrals')
      .then(d => setData(d as typeof data))
      .catch(() => null)
  }, [])

  const copy = () => {
    if (!data) return
    navigator.clipboard.writeText(data.link).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!data) return null

  return (
    <Card title="Refer a Friend">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-gray-200">
            Refer a friend —{' '}
            <span className="text-green-400 font-semibold">you both get ${data.reward.toFixed(0)} rendering credit</span>.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            You each earn ${data.reward.toFixed(0)} once your friend pays ${data.qualifyCharge.toFixed(0)} to their
            account. Credit can only be spent on rendering.
          </p>
        </div>

        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-2">
            Your referral link
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={data.link}
              aria-label="Your referral link"
              onFocus={e => e.currentTarget.select()}
              className="flex-1 text-sm text-gray-200 py-2 px-3 rounded bg-white/5 border border-white/10 font-mono"
            />
            <button type="button" onClick={copy}
              className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors whitespace-nowrap">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="flex gap-6 pt-1">
          <div>
            <div className="text-2xl font-bold text-white">{data.pending + data.credited}</div>
            <div className="text-xs text-gray-500">Friends joined</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">${data.earned.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Credit earned</div>
          </div>
          {data.pending > 0 && (
            <div>
              <div className="text-2xl font-bold text-amber-400">{data.pending}</div>
              <div className="text-xs text-gray-500">Pending (not yet qualified)</div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// Storage Settings section
// ---------------------------------------------------------------------------
function StorageSettingsSection() {
  const [autoPurgeDays, setAutoPurgeDays] = useState(20)
  const [costAlert, setCostAlert] = useState(5.00)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiFetch('/api/profile/storage-settings')
      .then(d => {
        setAutoPurgeDays((d as { autoPurgeDays: number }).autoPurgeDays)
        setCostAlert((d as { costAlertThreshold: number }).costAlertThreshold)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/profile/storage-settings', 'POST', {
        autoPurgeDays,
        costAlertThreshold: costAlert,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Storage Settings">
      <div className="flex flex-col gap-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {saved && <p className="text-green-400 text-sm">✓ Settings saved</p>}

        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : (
          <>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-2">
                Auto-purge Inactive Files (days)
              </label>
              <input
                type="number"
                min="7"
                max="90"
                value={autoPurgeDays}
                onChange={(e) => setAutoPurgeDays(parseInt(e.target.value, 10))}
                aria-label="Auto-purge inactive files (days)"
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Files not visited for this long will be automatically deleted</p>
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider font-medium block mb-2">
                Storage Cost Alert ($/month)
              </label>
              <input
                type="number"
                min="0.50"
                max="100"
                step="0.50"
                value={costAlert}
                onChange={(e) => setCostAlert(parseFloat(e.target.value))}
                aria-label="Storage cost alert threshold"
                className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm text-white"
              />
              <p className="text-xs text-gray-500 mt-1">You&apos;ll get an email alert if monthly cost exceeds this amount</p>
            </div>

            <div className="pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

// Active Sessions section
// ---------------------------------------------------------------------------
function SessionsSection() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading,  setLoading]  = useState(true)
  const [err,      setErr]      = useState('')
  const [deleting, setDeleting] = useState<number | null>(null)
  const [signingOutAll, setSigningOutAll] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/profile/sessions') as Session[]
      setSessions(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: number, isCurrent: boolean) => {
    setDeleting(id)
    try {
      const d = await apiFetch('/api/profile/sessions', 'DELETE', { id }) as { isCurrent?: boolean }
      if (d.isCurrent || isCurrent) {
        // Signing out own session — redirect to login
        localStorage.removeItem('rf_token'); localStorage.removeItem('rf_user')
        window.location.href = '/login'
      } else {
        setSessions(s => s.filter(x => x.id !== id))
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setDeleting(null)
    }
  }

  const handleSignOutAll = async () => {
    setSigningOutAll(true)
    try {
      await apiFetch('/api/profile/sessions?all=true', 'DELETE')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSigningOutAll(false)
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const others       = sessions.filter(s => !s.isCurrent)
  const sourceCount  = new Set(sessions.map(s => s.source)).size
  const tooManySessions = sessions.length > 3

  return (
    <Card title="Active Sessions">
      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No active sessions found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Summary */}
          <p className="text-xs text-gray-500">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''} across {sourceCount} device type{sourceCount !== 1 ? 's' : ''}
          </p>

          {/* Unusual activity warning */}
          {tooManySessions && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded bg-amber-900/20 border border-amber-500/30 text-amber-300 text-xs">
              <span>⚠</span>
              <span>Unusual session activity detected. If you don&apos;t recognise all these sessions, sign out all others and change your password.</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3 pr-4">IP Address</th>
                  <th className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3 pr-4">Source</th>
                  <th className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3 pr-4">Created</th>
                  <th className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3 pr-4">Expires</th>
                  <th scope="col" className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map(s => (
                  <tr key={s.id} className={s.isCurrent ? 'bg-blue-900/10' : ''}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-200 font-mono text-xs">{s.ip || '—'}</span>
                        {s.isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-300 border border-blue-700/40 whitespace-nowrap">
                            Current
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4"><SourceBadge source={s.source} /></td>
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(s.expiresAt)}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.isCurrent)}
                        disabled={deleting === s.id}
                        title={s.isCurrent ? 'Signs you out of the current browser session' : 'Sign out this session'}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                      >
                        {deleting === s.id ? '…' : 'Sign out'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <p className="text-xs text-gray-600">
              Sessions expire after 24 hours of inactivity. Signing in anywhere replaces your existing session — only 1 active session per account at a time.
            </p>
            {others.length > 0 && (
              <button type="button" onClick={handleSignOutAll} disabled={signingOutAll}
                className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors whitespace-nowrap ml-4 shrink-0">
                {signingOutAll ? 'Signing out…' : `Sign out all other sessions (${others.length})`}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Credit History Modal
// ---------------------------------------------------------------------------
interface CreditItem {
  id: number; amount: number; type: string; description: string
  jobId: number | null; createdAt: string; balance: number
}

const CREDIT_TYPE_LABEL: Record<string, { label: string; color: string }> = {
  welcome_bonus: { label: 'Bonus',       color: 'text-green-400 bg-green-400/10 border-green-400/25' },
  purchased:     { label: 'Purchase',    color: 'text-blue-400  bg-blue-400/10  border-blue-400/25'  },
  admin_grant:   { label: 'Admin Grant', color: 'text-purple-400 bg-purple-400/10 border-purple-400/25' },
  refund:        { label: 'Refund',      color: 'text-cyan-400  bg-cyan-400/10  border-cyan-400/25'  },
  usage:         { label: 'Usage',       color: 'text-gray-500  bg-gray-500/10  border-gray-500/25'  },
}

function CreditHistoryModal({ onClose, email: userEmail }: { onClose: () => void; email: string }) {
  const [items,   setItems]   = useState<CreditItem[]>([])
  const [balance, setBalance] = useState(0)
  const [page,    setPage]    = useState(1)
  const [pages,   setPages]   = useState(1)
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')

  const loadPage = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const d = await apiFetch(`/api/profile/credits?page=${p}&pageSize=25`) as {
        balance: number; items: CreditItem[]; total: number; page: number; pages: number
      }
      setBalance(d.balance); setItems(d.items); setTotal(d.total); setPage(d.page); setPages(d.pages)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load credit history')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPage(1) }, [loadPage])

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="calc-card w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-white">Credit History</h3>
            <p className="text-xs text-gray-500 mt-0.5">{userEmail}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {err && <p className="text-red-400 text-sm mb-3 shrink-0">{err}</p>}

        <div className="flex-1 overflow-auto">
          {loading ? (
            <p className="text-gray-500 text-sm text-center py-8">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-8">No credit transactions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0f1117]">
                <tr className="text-left">
                  {['DATE', 'TYPE', 'DESCRIPTION', 'JOB', 'AMOUNT', 'BALANCE'].map(h => (
                    <th key={h} className="text-xs text-gray-500 font-medium uppercase tracking-wider pb-3 pr-4 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map(item => {
                  const t = CREDIT_TYPE_LABEL[item.type] ?? { label: item.type, color: 'text-gray-500 bg-gray-500/10 border-gray-500/25' }
                  return (
                    <tr key={item.id}>
                      <td className="py-2.5 pr-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(item.createdAt)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${t.color}`}>{t.label}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-300 text-xs max-w-[200px] truncate">{item.description}</td>
                      <td className="py-2.5 pr-4 text-xs">
                        {item.jobId ? <span className="text-blue-400 font-mono">{item.jobId}</span> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className={`py-2.5 pr-4 text-xs font-mono font-medium ${item.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {item.amount >= 0 ? '+' : ''}{item.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-xs font-mono text-gray-400">${item.balance.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 pt-3 border-t border-white/5 flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            {pages > 1 && (
              <>
                <button type="button" onClick={() => loadPage(page - 1)} disabled={page <= 1 || loading}
                  className="px-2 py-1 text-xs text-gray-400 border border-white/10 rounded hover:text-white disabled:opacity-40">‹ Prev</button>
                <span className="text-xs text-gray-600">Page {page} of {pages} ({total} entries)</span>
                <button type="button" onClick={() => loadPage(page + 1)} disabled={page >= pages || loading}
                  className="px-2 py-1 text-xs text-gray-400 border border-white/10 rounded hover:text-white disabled:opacity-40">Next ›</button>
              </>
            )}
          </div>
          <div className="text-sm font-semibold text-white">
            Current Balance: <span className={balance > 10 ? 'text-white' : balance >= 5 ? 'text-amber-400' : 'text-red-400'}>${balance.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const [loading,      setLoading]      = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [firstName,    setFirstName]    = useState('')
  const [lastName,     setLastName]     = useState('')
  const [email,        setEmail]        = useState('')
  const [accountName,  setAccountName]  = useState('')
  const [showApiKey,   setShowApiKey]   = useState(false)
  const [showCredits,  setShowCredits]  = useState(false)
  const [creditBal,    setCreditBal]    = useState<number | null>(null)
  const [resetSent,    setResetSent]    = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [resetErr,     setResetErr]     = useState('')
  const [error,        setError]        = useState('')
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const [data, credits] = await Promise.all([
        apiFetch('/api/profile') as Promise<{ firstName: string; lastName: string; email: string; accountName: string }>,
        apiFetch('/api/profile/credits?pageSize=1').catch(() => null) as Promise<{ balance: number } | null>,
      ])
      setFirstName(data.firstName)
      setLastName(data.lastName)
      setEmail(data.email)
      setAccountName(data.accountName)
      if (credits?.balance != null) setCreditBal(credits.balance)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Save handlers for editable Name / Account
  const saveName = async (next: string) => {
    const parts = next.trim().split(/\s+/)
    const fn = parts[0] ?? ''
    const ln = parts.slice(1).join(' ')
    await apiFetch('/api/profile', 'PATCH', { firstName: fn, lastName: ln })
    setFirstName(fn); setLastName(ln)
  }

  const saveAccount = async (next: string) => {
    await apiFetch('/api/profile', 'PATCH', { accountName: next })
    setAccountName(next)
  }

  // Decode JWT to check super-admin status
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const token = localStorage.getItem('rf_token')
      if (!token) return
      const payload = JSON.parse(atob(token.split('.')[1]))
      setIsSuperAdmin(Boolean(payload.isSuperAdmin))
    } catch { /* ignore */ }
  }, [])

  const handleResetPassword = async () => {
    setResetting(true); setResetErr(''); setResetSent(false)
    try {
      await apiFetch('/api/profile/reset-password', 'POST')
      setResetSent(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => setResetSent(false), 6000)
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : 'Failed to send reset email')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-white tracking-tight">User Profile</h1>
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  // Derive a clean display name from the email when no name is stored
  const derived = deriveDisplayName(email)
  const fullName       = [firstName, lastName].filter(Boolean).join(' ') || derived
  const accountDisplay = accountName || derived

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <h1 className="text-2xl font-semibold text-white tracking-tight">User Profile</h1>

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-4 py-3">{error}</div>
      )}

      {/* Two-column top row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Details */}
        <Card title="Profile Details">
          <div className="flex flex-col gap-3">
            <EditableField label="Name"    value={fullName}       placeholder="Your full name" onSave={saveName} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 w-20 shrink-0">Email</span>
              <span className="text-sm text-gray-200">{email || <span className="text-gray-600 italic">—</span>}</span>
            </div>
            <EditableField label="Account" value={accountDisplay} placeholder="Account name"   onSave={saveAccount} />

            {creditBal !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20 shrink-0">Credit</span>
                <span className={`text-sm font-mono font-semibold ${creditBal > 10 ? 'text-white' : creditBal >= 5 ? 'text-amber-400' : 'text-red-400'}`}>
                  ${creditBal.toFixed(2)}
                </span>
                <button type="button" onClick={() => setShowCredits(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto">
                  View Credit History
                </button>
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-white/5">
              {resetSent && (
                <p className="text-green-400 text-xs mb-2">✓ Password reset email sent to {email}</p>
              )}
              {resetErr && (
                <p className="text-red-400 text-xs mb-2">{resetErr}</p>
              )}
              <button type="button" onClick={handleResetPassword} disabled={resetting}
                className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors">
                {resetting ? 'Sending…' : 'Reset Password'}
              </button>
              <span className="text-xs text-gray-600 ml-1">— we&apos;ll email you a reset link</span>
            </div>
          </div>
        </Card>

        {/* API Key Instructions */}
        <Card title="API Key Instructions">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-400">
              Use your API key to authenticate with the Renderfarm API and CLI tools from scripts and pipelines.
            </p>
            <ul className="flex flex-col gap-2 text-xs text-gray-500">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-gray-600">•</span>
                Keep it secret — never commit to version control
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-gray-600">•</span>
                Pass as <code className="text-gray-400 bg-white/5 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-gray-600">•</span>
                Regenerating immediately invalidates the old key
              </li>
            </ul>
            <div className="pt-2">
              <button type="button" onClick={() => setShowApiKey(true)}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                Get API Key
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Refer a Friend */}
      <ReferralSection />

      {/* Notification Preferences */}
      <NotificationsSection />

      {/* MFA */}
      <MfaSection />

      {/* Storage Settings — super admins only */}
      {isSuperAdmin && <StorageSettingsSection />}

      {/* Active Sessions */}
      <SessionsSection />

      {/* API Key Modal */}
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}

      {/* Credit History Modal */}
      {showCredits && <CreditHistoryModal email={email} onClose={() => setShowCredits(false)} />}
    </div>
  )
}
