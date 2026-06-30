'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/lib/auth'
import GoogleSignInButton from './GoogleSignInButton'
import s from './login.module.css'

interface Props {
  port: string | null   // passed from the Server Component — already read server-side
}

export default function LoginForm({ port }: Props) {
  const router = useRouter()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, clientType: port ? 'electron' : 'web' }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Login failed')

      setToken(data.access_token, data.user)
      setSuccess(true)

      // If the account requires 2FA but the user hasn't set it up, show a notice
      // before redirecting (full TOTP implementation is a future milestone).
      if (data.requires2faSetup) {
        setError('Note: your account administrator requires two-factor authentication. Please contact support to complete 2FA setup.')
        // Still allow login — just informational until TOTP is implemented
      }

      if (port) {
        // DCC plugin flow — redirect to Blender's local callback server
        setTimeout(() => {
          window.location.href = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(data.access_token)}&email=${encodeURIComponent(data.user.email)}`
        }, 1500)
      } else {
        router.push('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={s.page}>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
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
        <h1 className={s.heroTitle}>SIGN IN TO RENDERFARM</h1>
      </div>

      {/* ── Form panel ────────────────────────────────────────────────── */}
      <div className={s.panel}>
        <div className={s.box}>

          {success ? (
            <div className={s.pluginSuccess}>
              <span className={s.pluginSuccessIcon}>&#9889;</span>
              <p className={s.pluginSuccessTitle}>Signed in successfully!</p>
              <p className={s.pluginSuccessHint}>
                {port
                  ? 'Sending token to Blender… you can close this tab.'
                  : 'Redirecting to dashboard…'}
              </p>
            </div>
          ) : (
            <>
              {error && <div className={s.error}>{error}</div>}

              <form onSubmit={handleSubmit} className={s.form}>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={s.input}
                />
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={s.input}
                />
                <button type="submit" disabled={loading} className={s.submitBtn}>
                  {loading ? 'SIGNING IN…' : 'SIGN IN'}
                </button>
              </form>

              <a href="/forgot-password" className={s.forgot}>Forgot password?</a>

              <div className={s.divider} />

              <GoogleSignInButton port={port} />

              <p className={s.registerLine}>
                No Renderfarm account?{' '}
                <a href="/register" className={s.registerLink}>Create a New Account »</a>
              </p>

              {/* Debug line — remove once Blender auth flow is confirmed working */}
              <p className={s.debugLine}>
                {port ? `Plugin mode · port ${port}` : 'Web mode'}
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
