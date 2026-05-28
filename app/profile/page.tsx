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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Session {
  id: number
  ip: string
  userAgent: string
  createdAt: string
  expiresAt: string
  isCurrent: boolean
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

  const others = sessions.filter(s => !s.isCurrent)

  return (
    <Card title="Active Sessions">
      {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No active sessions found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="text-xs text-gray-500 uppercase tracking-wider font-medium pb-3 pr-4">IP Address</th>
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
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fmtDate(s.expiresAt)}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.isCurrent)}
                        disabled={deleting === s.id}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
                      >
                        {deleting === s.id ? '…' : s.isCurrent ? 'Sign out' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {others.length > 0 && (
            <div className="flex justify-end pt-1 border-t border-white/5">
              <button type="button" onClick={handleSignOutAll} disabled={signingOutAll}
                className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40 transition-colors">
                {signingOutAll ? 'Signing out…' : 'Sign out all other sessions'}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const [loading,      setLoading]      = useState(true)
  const [firstName,    setFirstName]    = useState('')
  const [lastName,     setLastName]     = useState('')
  const [email,        setEmail]        = useState('')
  const [accountName,  setAccountName]  = useState('')
  const [showApiKey,   setShowApiKey]   = useState(false)
  const [resetSent,    setResetSent]    = useState(false)
  const [resetting,    setResetting]    = useState(false)
  const [resetErr,     setResetErr]     = useState('')
  const [error,        setError]        = useState('')
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/api/profile') as {
        firstName: string; lastName: string; email: string; accountName: string
      }
      setFirstName(data.firstName)
      setLastName(data.lastName)
      setEmail(data.email)
      setAccountName(data.accountName)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

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
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-white tracking-tight">User Profile</h1>
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  const fullName = [firstName, lastName].filter(Boolean).join(' ') || '—'

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-white tracking-tight">User Profile</h1>

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-4 py-3">{error}</div>
      )}

      {/* Two-column top row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Details */}
        <Card title="Profile Details">
          <div className="flex flex-col gap-4">
            <ReadField label="Name"    value={fullName} />
            <ReadField label="Email"   value={email} />
            <ReadField label="Account" value={accountName} />

            <div className="pt-2 border-t border-white/5">
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
              <span className="text-xs text-gray-600 ml-1">— we'll email you a reset link</span>
            </div>
          </div>
        </Card>

        {/* API Key Instructions */}
        <Card title="API Key Instructions">
          <div className="flex flex-col gap-4 h-full">
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
            <div className="mt-auto pt-2">
              <button type="button" onClick={() => setShowApiKey(true)}
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                Get API Key
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* MFA */}
      <MfaSection />

      {/* Active Sessions */}
      <SessionsSection />

      {/* API Key Modal */}
      {showApiKey && <ApiKeyModal onClose={() => setShowApiKey(false)} />}
    </div>
  )
}
