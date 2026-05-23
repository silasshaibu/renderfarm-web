'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function BlenderConnectInner() {
  const searchParams = useSearchParams()
  const port = searchParams.get('port') ?? '8989'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message,  setMessage]  = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.message ?? 'Invalid credentials')
        return
      }

      const { access_token, user } = data

      // Redirect to Blender's local callback server
      const callbackUrl = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(access_token)}&email=${encodeURIComponent(user.email)}`

      setStatus('success')
      setMessage('Signed in! Sending token to Blender…')

      // Small delay so the user sees the success message
      setTimeout(() => {
        window.location.href = callbackUrl
      }, 800)

    } catch {
      setStatus('error')
      setMessage('Could not reach the server. Make sure the dev server is running.')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span style={styles.logoText}>Renderfarm</span>
        </div>

        <h1 style={styles.heading}>Connect Blender</h1>
        <p style={styles.sub}>Sign in to authorise the Blender add-on</p>

        {status === 'success' ? (
          <div style={styles.successBox}>
            <span style={styles.successIcon}>✓</span>
            <p style={styles.successText}>{message}</p>
            <p style={styles.successHint}>You can close this tab and return to Blender.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@example.com"
              required
              autoFocus
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
              required
            />

            {status === 'error' && (
              <div style={styles.errorBox}>{message}</div>
            )}

            <button
              type="submit"
              style={{
                ...styles.btn,
                opacity: status === 'loading' ? 0.6 : 1,
                cursor:  status === 'loading' ? 'not-allowed' : 'pointer',
              }}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Signing in…' : 'Sign In & Connect'}
            </button>
          </form>
        )}

        <p style={styles.footer}>
          Blender add-on v1.0.0 · Port {port}
        </p>
      </div>
    </div>
  )
}

export default function BlenderConnectPage() {
  return (
    <Suspense>
      <BlenderConnectInner />
    </Suspense>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight:       '100vh',
    background:      '#0d0d1a',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    fontFamily:      '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding:         '24px',
  },
  card: {
    background:   '#1a1a2e',
    border:       '1px solid #2a2a4a',
    borderRadius: '16px',
    padding:      '40px',
    width:        '100%',
    maxWidth:     '400px',
    boxShadow:    '0 24px 64px rgba(0,0,0,0.5)',
  },
  logo: {
    display:        'flex',
    alignItems:     'center',
    gap:            '10px',
    marginBottom:   '28px',
  },
  logoText: {
    color:      '#fff',
    fontSize:   '20px',
    fontWeight: '700',
    letterSpacing: '0.5px',
  },
  heading: {
    color:        '#fff',
    fontSize:     '24px',
    fontWeight:   '700',
    margin:       '0 0 8px',
  },
  sub: {
    color:        '#8888aa',
    fontSize:     '14px',
    margin:       '0 0 28px',
  },
  form: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
  },
  label: {
    color:      '#aaaacc',
    fontSize:   '13px',
    fontWeight: '500',
    marginTop:  '12px',
    marginBottom: '4px',
  },
  input: {
    background:   '#0d0d1a',
    border:       '1px solid #2a2a4a',
    borderRadius: '8px',
    color:        '#fff',
    fontSize:     '14px',
    padding:      '10px 14px',
    outline:      'none',
    width:        '100%',
    boxSizing:    'border-box',
  },
  errorBox: {
    background:   'rgba(239,68,68,0.12)',
    border:       '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    color:        '#f87171',
    fontSize:     '13px',
    padding:      '10px 14px',
    marginTop:    '12px',
  },
  btn: {
    background:   '#22d3ee',
    border:       'none',
    borderRadius: '8px',
    color:        '#000',
    fontSize:     '15px',
    fontWeight:   '600',
    padding:      '12px',
    marginTop:    '20px',
    width:        '100%',
  },
  successBox: {
    textAlign:  'center',
    padding:    '24px 0',
  },
  successIcon: {
    fontSize:   '48px',
    color:      '#22d3ee',
    display:    'block',
    marginBottom: '12px',
  },
  successText: {
    color:      '#fff',
    fontSize:   '16px',
    fontWeight: '600',
    margin:     '0 0 8px',
  },
  successHint: {
    color:    '#8888aa',
    fontSize: '13px',
    margin:   0,
  },
  footer: {
    color:      '#444466',
    fontSize:   '12px',
    textAlign:  'center',
    marginTop:  '28px',
    marginBottom: 0,
  },
}
