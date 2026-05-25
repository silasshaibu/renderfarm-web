'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import s from '../login/login.module.css'

function ResetForm() {
  const params = useSearchParams()
  const token  = params.get('token') ?? ''

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Invalid reset link — no token found. Please request a new one.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({})) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Reset failed')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.box}>
      {done ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>
            Password updated
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 20px' }}>
            Your password has been changed. All existing sessions have been signed out for security.
          </p>
          <a href="/login" className={s.submitBtn}
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            SIGN IN
          </a>
        </div>
      ) : (
        <>
          {!token && (
            <div className={s.error}>
              This reset link is missing its token. Please{' '}
              <a href="/forgot-password" style={{ color: '#0ea5e9' }}>request a new one</a>.
            </div>
          )}

          {error && <div className={s.error}>{error}</div>}

          <form onSubmit={handleSubmit} className={s.form}>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={s.input}
            />
            <input
              name="confirm"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={s.input}
            />
            <button type="submit" disabled={loading || !token} className={s.submitBtn}>
              {loading ? 'UPDATING…' : 'SET NEW PASSWORD'}
            </button>
          </form>

          <a href="/forgot-password" className={s.forgot} style={{ marginTop: 4 }}>
            ← Request a new link
          </a>
        </>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className={s.page}>
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
        <h1 className={s.heroTitle}>SET A NEW PASSWORD</h1>
      </div>

      <div className={s.panel}>
        <Suspense fallback={<div className={s.box}><p style={{ color: '#9ca3af' }}>Loading…</p></div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  )
}
