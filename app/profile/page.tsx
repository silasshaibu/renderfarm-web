'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Reusable form field
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

function TextInput({ id, value, onChange, type = 'text', readOnly = false }: {
  id: string; value: string; onChange?: (v: string) => void
  type?: string; readOnly?: boolean
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={['calc-input px-3 py-2', readOnly ? 'opacity-60 cursor-default' : ''].join(' ')}
    />
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="calc-card">
      <h2 className="text-base font-semibold text-white mb-5 pb-3 profile-section-title">
        {title}
      </h2>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save button
// ---------------------------------------------------------------------------
function SaveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="px-5 py-2 rounded text-sm font-medium profile-danger-btn">
      Save Changes
    </button>
  )
}

// ---------------------------------------------------------------------------
// API Key display
// ---------------------------------------------------------------------------
function ApiKey({ value }: { value: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied,   setCopied]   = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 calc-input px-3 py-2 font-mono text-sm text-gray-300 overflow-hidden">
        {revealed ? value : '•'.repeat(40)}
      </div>
      <button type="button" onClick={() => setRevealed((r) => !r)}
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
// Page
// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const [firstName, setFirstName] = useState('Silas')
  const [lastName,  setLastName]  = useState('Shaibu')
  const [email]                   = useState('silasshaibu2@gmail.com')
  const [phone,     setPhone]     = useState('')
  const [company,   setCompany]   = useState('Swade Art')
  const [country,   setCountry]   = useState('Ghana')
  const [timezone,  setTimezone]  = useState('Africa/Accra')

  const [emailNotifs, setEmailNotifs] = useState(true)
  const [jobComplete, setJobComplete] = useState(true)
  const [jobFailed,   setJobFailed]   = useState(true)
  const [weeklyReport, setWeeklyReport] = useState(false)

  const [saved, setSaved] = useState(false)
  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account details and preferences</p>
      </div>

      {saved && (
        <div className="enterprise-alert-success">
          <span>✓</span> Changes saved successfully
        </div>
      )}

      {/* Personal Information */}
      <Section title="Personal Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="First Name" id="first-name">
            <TextInput id="first-name" value={firstName} onChange={setFirstName} />
          </FormField>
          <FormField label="Last Name" id="last-name">
            <TextInput id="last-name" value={lastName} onChange={setLastName} />
          </FormField>
        </div>
        <FormField label="Email Address" id="email">
          <TextInput id="email" value={email} type="email" readOnly />
        </FormField>
        <FormField label="Phone Number" id="phone">
          <TextInput id="phone" value={phone} onChange={setPhone} type="tel" />
        </FormField>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} />
        </div>
      </Section>

      {/* Organization */}
      <Section title="Organization">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Company / Studio" id="company">
            <TextInput id="company" value={company} onChange={setCompany} />
          </FormField>
          <FormField label="Country" id="country">
            <TextInput id="country" value={country} onChange={setCountry} />
          </FormField>
        </div>
        <FormField label="Timezone" id="timezone">
          <select id="timezone" title="Timezone" value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="calc-input px-3 py-2">
            {[
              'Africa/Accra','Africa/Lagos','Europe/London','Europe/Paris',
              'America/New_York','America/Los_Angeles','Asia/Tokyo','Australia/Sydney',
            ].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </FormField>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} />
        </div>
      </Section>

      {/* API Key */}
      <Section title="API Key">
        <p className="text-sm text-gray-500">
          Use this key to authenticate with the Conductor API and CLI tools.
          Keep it secret — do not commit it to version control.
        </p>
        <FormField label="API Key" id="api-key">
          <ApiKey value="ck_live_2f8a3b9d7e1c4f6a0b5d8e2f3a7c9b1d4e6f8a0b2c4d6e8f0a1b3c5d7e9f1a3b5" />
        </FormField>
        <div className="flex gap-2 pt-1">
          <button type="button"
            className="px-4 py-1.5 rounded text-xs font-medium text-gray-300 border border-white/10 hover:border-white/20 hover:text-white transition-colors">
            Regenerate Key
          </button>
        </div>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notification Preferences">
        <div className="flex flex-col gap-3">
          {[
            { id: 'email-notifs',   label: 'Email notifications',        sub: 'Receive emails for account events', val: emailNotifs, set: setEmailNotifs },
            { id: 'notif-complete', label: 'Job completed',              sub: 'Alert when a render job finishes',  val: jobComplete,  set: setJobComplete  },
            { id: 'notif-failed',   label: 'Job failed',                 sub: 'Alert when a job encounters an error', val: jobFailed,  set: setJobFailed    },
            { id: 'notif-weekly',   label: 'Weekly usage report',        sub: 'Summary of compute spend each week',   val: weeklyReport, set: setWeeklyReport },
          ].map(({ id, label, sub, val, set }) => (
            <label key={id} htmlFor={id}
              className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors">
              <input
                type="checkbox" id={id}
                className="accent-blue-500 mt-0.5 shrink-0"
                checked={val}
                onChange={() => set((v) => !v)}
              />
              <div>
                <p className="text-sm text-gray-200">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <SaveBtn onClick={handleSave} />
        </div>
      </Section>

      {/* Danger zone */}
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
