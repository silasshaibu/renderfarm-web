'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import styles from './login.module.css'

type Step = 'credentials' | 'totp'

export default function CmsLoginPage() {
  const router = useRouter()
  const [step, setStep]         = useState<Step>('credentials')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode]         = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleCredentials(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/cms/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? 'Login failed'); return }
      if (!data.requiresTOTP) {
        setError('TOTP not configured for this account. Contact your system administrator.')
        return
      }
      setStep('totp')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTOTP(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body: Record<string, string> = { email, password }
      if (useBackup) body.backupCode = code
      else           body.totpCode   = code

      const res  = await fetch('/api/cms/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? 'Authentication failed'); return }
      router.push('/cms')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⚙</span>
          <span className={styles.logoText}>Renderfarm CMS</span>
        </div>
        <p className={styles.subtitle}>Super Admin Console</p>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className={styles.form}>
            <label className={styles.label}>
              Email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="username"
                required
                disabled={loading}
              />
            </label>
            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTOTP} className={styles.form}>
            <p className={styles.totpHint}>
              {useBackup
                ? 'Enter one of your backup codes.'
                : 'Enter the 6-digit code from your authenticator app.'}
            </p>
            <label className={styles.label}>
              {useBackup ? 'Backup Code' : 'Authenticator Code'}
              <input
                className={`${styles.input} ${styles.codeInput}`}
                type="text"
                value={code}
                onChange={e => setCode(e.target.value)}
                inputMode="numeric"
                maxLength={useBackup ? 17 : 6}
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={loading}
              />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setUseBackup(b => !b); setCode('') }}
            >
              {useBackup ? 'Use authenticator app' : 'Use a backup code'}
            </button>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setStep('credentials'); setCode(''); setError('') }}
            >
              Back
            </button>
          </form>
        )}

        <p className={styles.warning}>
          Authorised access only. All activity is logged and monitored.
        </p>
      </div>
    </div>
  )
}
