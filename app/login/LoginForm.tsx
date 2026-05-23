'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/lib/auth'
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
        body:    JSON.stringify({ email, password }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Login failed')

      setToken(data.access_token, data.user)
      setSuccess(true)

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

              <button type="button" className={s.googleBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>

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
