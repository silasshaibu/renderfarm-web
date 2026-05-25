'use client'

import { useState, useEffect, useCallback } from 'react'
import { getToken, getUser } from '@/lib/auth'

// ---------------------------------------------------------------------------
// Shared UI primitives
// ---------------------------------------------------------------------------
function FormField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  )
}

function TextInput({ id, value, onChange, type = 'text', readOnly = false, placeholder }: {
  id: string; value: string; onChange?: (v: string) => void
  type?: string; readOnly?: boolean; placeholder?: string
}) {
  return (
    <input
      id={id} type={type} value={value} readOnly={readOnly}
      placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={['calc-input px-3 py-2', readOnly ? 'opacity-60 cursor-default' : ''].join(' ')}
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="calc-card">
      <h2 className="text-base font-semibold text-white mb-5 pb-3 profile-section-title">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

function SaveBtn({ onClick, saving }: { onClick: () => void; saving?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={saving}
      className="px-5 py-2 rounded text-sm font-medium profile-danger-btn disabled:opacity-50">
      {saving ? 'Saving…' : 'Save Changes'}
    </button>
  )
}

function ApiKey({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied,   setCopied]   = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 calc-input px-3 py-2 font-mono text-sm text-gray-300 overflow-hidden truncate">
        {revealed ? value : '•'.repeat(40)}
      </div>
      <button type="button" onClick={() => setRevealed(r => !r)}
        className="px-3 py-2 rounded text-xs text-gray-400 border border-white/10 hover:text-white hover:border-white/20 transition-colors whitespace-nowrap">
        {revealed ? 'Hide' : 'Reveal'}
      </button>
      <button type="button" onClick={handleCopy}
        className="px-3 py-2 rounded text-xs text-gray-400 border border-white/10 hover:text-white hover:border-white/20 transition-colors whitespace-nowrap">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function apiFetch(path: string, method = 'GET', body?: object) {
  const token = getToken() ?? ''
  const res   = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Change password section
// ---------------------------------------------------------------------------
function ChangePasswordSection() {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [saving,   setSaving]   = useState(false)
  const [ok,       setOk]       = useState(false)
  const [err,      setErr]      = useState('')

  const handleSave = async () => {
    setErr(''); setOk(false)
    if (next.length < 8)        { setErr('New password must be at least 8 characters.'); return }
    if (next !== confirm)       { setErr('Passwords do not match.'); return }
    setSaving(true)
    try {
      const token = getToken() ?? ''
      const res = await fetch('/api/profile/password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const d = await res.json().catch(() => ({})) as { message?: string }
      if (!res.ok) throw new Error(d.message ?? 'Update failed')
      setOk(true)
      setCurrent(''); setNext(''); setConfirm('')
      setTimeout(() => setOk(false), 3000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Security">
      {ok  && <div className="enterprise-alert-success"><span>✓</span> Password updated</div>}
      {err && <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-4 py-3">{err}</div>}
      <FormField label="Current Password" id="pw-current">
        <TextInput id="pw-current" type="password" value={current} onChange={setCurrent} placeholder="Current password" />
      </FormField>
      <FormField label="New Password" id="pw-new">
        <TextInput id="pw-new" type="password" value={next} onChange={setNext} placeholder="Min 8 characters" />
      </FormField>
      <FormField label="Confirm New Password" id="pw-confirm">
        <TextInput id="pw-confirm" type="password" value={confirm} onChange={setConfirm} placeholder="Repeat new password" />
      </FormField>
      <div className="flex justify-end pt-2">
        <SaveBtn onClick={handleSave} saving={saving} />
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
const TIMEZONES = [
  'Africa/Accra', 'Africa/Lagos', 'Europe/London', 'Europe/Paris',
  'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney',
]

export default function ProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [phone,     setPhone]     = useState('')
  const [company,   setCompany]   = useState('')
  const [country,   setCountry]   = useState('')
  const [accountName, setAccountName] = useState('')
  const [timezone,  setTimezone]  = useState('Africa/Accra')
  const [isAdmin,   setIsAdmin]   = useState(false)
  const [createdAt, setCreatedAt] = useState('')
  const [jobCount,  setJobCount]  = useState<number | null>(null)
  const [totalSpend, setTotalSpend] = useState<number | null>(null)

  // Notification prefs (client-only for now)
  const [emailNotifs,  setEmailNotifs]  = useState(true)
  const [jobComplete,  setJobComplete]  = useState(true)
  const [jobFailed,    setJobFailed]    = useState(true)
  const [weeklyReport, setWeeklyReport] = useState(false)

  // ── Load profile on mount ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    // Snapshot admin flag from client token immediately (no flicker)
    const localUser = getUser()
    if (localUser?.isAdmin) setIsAdmin(true)

    try {
      const [data, jobs] = await Promise.all([
        apiFetch('/api/profile') as Promise<{
          firstName: string; lastName: string; email: string
          phone: string; company: string; country: string
          accountName: string; isAdmin: boolean; createdAt?: string
        }>,
        apiFetch('/api/jobs').catch(() => [] as unknown[]),
      ])
      setFirstName(data.firstName)
      setLastName(data.lastName)
      setEmail(data.email)
      setPhone(data.phone ?? '')
      setCompany(data.company ?? '')
      setCountry(data.country ?? '')
      setAccountName(data.accountName ?? '')
      setIsAdmin(Boolean(data.isAdmin))
      if (data.createdAt) setCreatedAt(data.createdAt)

      // Compute stats from jobs list
      if (Array.isArray(jobs)) {
        setJobCount(jobs.length)
        const spend = (jobs as Array<{ costUsd?: number }>)
          .reduce((acc, j) => acc + (j.costUsd ?? 0), 0)
        setTotalSpend(spend)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      await apiFetch('/api/profile', 'PATCH', { firstName, lastName, phone, company, country })
      setSaved(true); setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived API key (JWT-based, deterministic per account) ──────────────────
  // In production this would be a stored secret; here we use a stable placeholder.
  const apiKeyDisplay = email
    ? `rf_live_${btoa(email).replace(/[^a-z0-9]/gi, '').slice(0, 32).padEnd(32, '0')}`
    : '—'

  if (loading) return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-white tracking-tight">Profile</h1>
      <p className="text-gray-500 text-sm py-10 text-center">Loading…</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Profile</h1>
          {isAdmin && (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-900/50 text-blue-300 border border-blue-700/40">
              Admin
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account details and preferences
          {createdAt && (
            <span className="ml-2 text-gray-600">
              · Member since {new Date(createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </span>
          )}
        </p>
      </div>

      {/* Account stats strip */}
      {jobCount !== null && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Jobs submitted', value: String(jobCount) },
            { label: 'Total spend',    value: `$${(totalSpend ?? 0).toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="calc-card text-center py-4">
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {saved && (
        <div className="enterprise-alert-success"><span>✓</span> Changes saved successfully</div>
      )}
      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/40 rounded px-4 py-3">{error}</div>
      )}

      {/* Personal Information */}
      <Section title="Personal Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="First Name" id="first-name">
            <TextInput id="first-name" value={firstName} onChange={setFirstName} placeholder="First name" />
          </FormField>
          <FormField label="Last Name" id="last-name">
            <TextInput id="last-name" value={lastName} onChange={setLastName} placeholder="Last name" />
          </FormField>
        </div>
        <FormField label="Email Address" id="email">
          <TextInput id="email" value={email} type="email" readOnly />
        </FormField>
        <FormField label="Account Name" id="account-name">
          <TextInput id="account-name" value={accountName} readOnly />
        </FormField>
        <FormField label="Phone Number" id="phone">
          <TextInput id="phone" value={phone} onChange={setPhone} type="tel" placeholder="+1 555 000 0000" />
        </FormField>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} saving={saving} />
        </div>
      </Section>

      {/* Organization */}
      <Section title="Organization">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Company / Studio" id="company">
            <TextInput id="company" value={company} onChange={setCompany} placeholder="Your studio" />
          </FormField>
          <FormField label="Country" id="country">
            <TextInput id="country" value={country} onChange={setCountry} placeholder="Country" />
          </FormField>
        </div>
        <FormField label="Timezone" id="timezone">
          <select id="timezone" title="Timezone" value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="calc-input px-3 py-2">
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </FormField>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} saving={saving} />
        </div>
      </Section>

      {/* Change password */}
      <ChangePasswordSection />

      {/* API Key */}
      <Section title="API Key">
        <p className="text-sm text-gray-500">
          Use this key to authenticate with the Renderfarm API and CLI tools.
          Keep it secret — do not commit it to version control.
        </p>
        <FormField label="API Key" id="api-key">
          <ApiKey value={apiKeyDisplay} />
        </FormField>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notification Preferences">
        <div className="flex flex-col gap-3">
          {[
            { id: 'email-notifs',   label: 'Email notifications', sub: 'Receive emails for account events',         val: emailNotifs,  set: setEmailNotifs  },
            { id: 'notif-complete', label: 'Job completed',        sub: 'Alert when a render job finishes',          val: jobComplete,  set: setJobComplete  },
            { id: 'notif-failed',   label: 'Job failed',           sub: 'Alert when a job encounters an error',      val: jobFailed,    set: setJobFailed    },
            { id: 'notif-weekly',   label: 'Weekly usage report',  sub: 'Summary of compute spend each week',        val: weeklyReport, set: setWeeklyReport },
          ].map(({ id, label, sub, val, set }) => (
            <label key={id} htmlFor={id}
              className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
              <input type="checkbox" id={id} className="accent-blue-500 mt-0.5 shrink-0"
                checked={val} onChange={() => set(v => !v)} />
              <div>
                <p className="text-sm text-gray-200">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} saving={saving} />
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <p className="text-sm text-gray-500">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <div>
          <button type="button"
            className="px-4 py-2 rounded text-sm font-medium text-red-400 border border-red-900/50 hover:bg-red-900/20 transition-colors">
            Delete Account
          </button>
        </div>
      </Section>
    </div>
  )
}
