'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import s from './register.module.css'

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Netherlands', 'Japan', 'South Korea', 'India', 'Brazil',
  'South Africa', 'Ghana', 'Nigeria', 'Kenya', 'Other',
]

export default function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    firstName:   '',
    lastName:    '',
    phone:       '',
    country:     '',
    company:     '',
    email:       '',
    accountName: '',
  })
  const [googleSignIn, setGoogleSignIn] = useState(false)
  const [agreedTerms,  setAgreedTerms]  = useState(false)
  const [notRobot,     setNotRobot]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }))

  const canSubmit =
    form.firstName && form.lastName && form.country &&
    form.email && form.accountName && agreedTerms && notRobot

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setLoading(true)
    try {
      // TODO: wire to real register API endpoint
      await new Promise((r) => setTimeout(r, 800))
      router.push('/login?registered=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>

      {/* ── Hero banner ───────────────────────────────────────────────── */}
      <div className={s.hero}>
        <div className={s.logoRow}>
          <div className={s.iconWrap}>
            <svg width="36" height="36" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <path
                d="M26 6 L31 19 L45 19 L34 28 L38 42 L26 33 L14 42 L18 28 L7 19 L21 19 Z"
                fill="#0ea5e9"
              />
            </svg>
          </div>
          <div className={s.wordmark}>
            <span className={s.wordmarkSub}>CLOUD RENDERING</span>
            <span className={s.wordmarkMain}>RENDERFARM</span>
          </div>
        </div>

        <h1 className={s.heroTitle}>
          GET STARTED WITH RENDERFARM
        </h1>
      </div>

      {/* ── Form panel ────────────────────────────────────────────────── */}
      <div className={s.panel}>
        <div className={s.box}>

          {error && <div className={s.error}>{error}</div>}

          <form onSubmit={handleSubmit}>

            {/* First Name + Last Name */}
            <div className={s.row}>
              <div className={s.field}>
                <label className={s.label}>FIRST NAME *</label>
                <input
                  type="text" required placeholder="First name"
                  value={form.firstName} onChange={set('firstName')}
                  className={s.input}
                />
              </div>
              <div className={s.field}>
                <label className={s.label}>LAST NAME *</label>
                <input
                  type="text" required placeholder="Last name"
                  value={form.lastName} onChange={set('lastName')}
                  className={s.input}
                />
              </div>
            </div>

            {/* Phone */}
            <div className={s.field}>
              <label className={s.label}>PHONE (OPTIONAL)</label>
              <input
                type="tel" placeholder="+1 555 000 0000"
                value={form.phone} onChange={set('phone')}
                className={s.input}
              />
            </div>

            {/* Country */}
            <div className={s.field}>
              <label className={s.label}>COUNTRY *</label>
              <select
                required value={form.country} onChange={set('country')}
                className={s.select}
              >
                <option value="">Select country…</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Company */}
            <div className={s.field}>
              <label className={s.label}>COMPANY NAME</label>
              <input
                type="text" placeholder="Your studio or company"
                value={form.company} onChange={set('company')}
                className={s.input}
              />
            </div>

            {/* Email */}
            <div className={s.field}>
              <label className={s.label}>EMAIL *</label>
              <input
                type="email" required placeholder="you@studio.com"
                value={form.email} onChange={set('email')}
                className={s.input}
              />
            </div>

            {/* Account name */}
            <div className={s.field}>
              <label className={s.label}>ACCOUNT NAME *</label>
              <input
                type="text" required placeholder="e.g. my-studio"
                value={form.accountName} onChange={set('accountName')}
                className={s.input}
              />
            </div>

            {/* Checkboxes */}
            <div className={s.checkGroup}>
              <label className={s.checkRow}>
                <input
                  type="checkbox"
                  checked={googleSignIn}
                  onChange={(e) => setGoogleSignIn(e.target.checked)}
                  className={s.checkbox}
                />
                <span className={s.checkText}>
                  Sign in with Google instead of username and password, for yourself
                  and invitees. A Google Workspace account is required.
                </span>
              </label>

              <label className={s.checkRow}>
                <input
                  type="checkbox" required
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className={s.checkbox}
                />
                <span className={s.checkText}>
                  You accept Renderfarm&apos;s{' '}
                  <a href="#" className={s.checkLink}>Customer Agreement</a>
                  {' & '}
                  <a href="#" className={s.checkLink}>Privacy Policy</a>
                  {' '}and confirm that you have the right to do so on behalf of
                  your organization.
                </span>
              </label>
            </div>

            {/* reCAPTCHA (UI mock) */}
            <div className={s.captcha} onClick={() => setNotRobot(true)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setNotRobot(true)}>
              <div className={s.captchaCheck} style={{ background: notRobot ? '#0d9488' : '#fff', borderColor: notRobot ? '#0d9488' : '#9ca3af' }}>
                {notRobot && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </div>
              <span className={s.captchaLabel}>I&apos;m not a robot</span>
              <div className={s.captchaLogo}>
                <svg width="32" height="32" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="32" fill="#4A90D9"/>
                  <text x="32" y="42" textAnchor="middle" fontSize="28" fontWeight="bold" fill="#fff">r</text>
                </svg>
                <span className={s.captchaLogoText}>reCAPTCHA</span>
                <span className={s.captchaLogoText}>Privacy · Terms</span>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={!canSubmit || loading} className={s.submitBtn}>
              {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
            </button>

          </form>

          <p className={s.signinLine}>
            Already have an account?{' '}
            <Link href="/login" className={s.signinLink}>Sign in »</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
