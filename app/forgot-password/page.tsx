'use client'

import { useState } from 'react'
import s from '../login/login.module.css'

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error,     setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { message?: string }).message ?? 'Request failed')
      }
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>
      {/* ── Hero ── */}
      <div className={s.hero}>
        <div className={s.logoRow}>
          <div className={s.iconWrap}>
            <svg width="36" height="36" viewBox="0 0 52 52" fill="none" aria-hidden="true">
              <path d="M26 6 L31 19 L45 19 L34 28 L38 42 L26 33 L14 42 L18 28 L7 19 L21 19 Z" fill="#0ea5e9"/>
            </svg>
          </div>
          <div className={s.wordmark}>
            <span className={s.wordmarkSub}>CLOUD RENDERING</span>
            <span className={s.wordmarkMain}>RENDERFARM</span>
          </div>
        </div>
        <h1 className={s.heroTitle}>RESET YOUR PASSWORD</h1>
      </div>

      {/* ── Panel ── */}
      <div className={s.panel}>
        <div className={s.box}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>
                Check your inbox
              </p>
              <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 20px' }}>
                If an account exists for <strong style={{ color: '#e5e7eb' }}>{email}</strong>,
                you&apos;ll receive a reset link shortly.
              </p>
              <a href="/login" className={s.forgot}>← Back to sign in</a>
            </div>
          ) : (
            <>
              <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 4px' }}>
                Enter the email address for your account and we&apos;ll send you a reset link.
              </p>

              {error && <div className={s.error}>{error}</div>}

              <form onSubmit={handleSubmit} className={s.form}>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={s.input}
                />
                <button type="submit" disabled={loading} className={s.submitBtn}>
                  {loading ? 'SENDING…' : 'SEND RESET LINK'}
                </button>
              </form>

              <a href="/login" className={s.forgot} style={{ marginTop: 4 }}>← Back to sign in</a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
