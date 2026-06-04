'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/lib/auth'

// Minimal typing for the Google Identity Services global
interface GoogleCredentialResponse { credential: string }
interface GoogleAccountsId {
  initialize: (cfg: { client_id: string; callback: (r: GoogleCredentialResponse) => void }) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
  prompt: () => void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

export default function GoogleSignInButton({ port }: { port: string | null }) {
  const router = useRouter()
  const divRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!clientId) return

    const handleCredential = async (response: GoogleCredentialResponse) => {
      setError('')
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message ?? 'Google sign-in failed')

        setToken(data.access_token, data.user)

        if (port) {
          window.location.href = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(data.access_token)}&email=${encodeURIComponent(data.user.email)}`
        } else {
          router.push('/')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Google sign-in failed')
      }
    }

    const init = () => {
      if (!window.google || !divRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      })
      window.google.accounts.id.renderButton(divRef.current, {
        theme: 'filled_blue',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: 320,
        logo_alignment: 'center',
      })
    }

    // Load the GIS script once
    const existing = document.getElementById('google-gsi-script')
    if (existing) {
      init()
    } else {
      const script = document.createElement('script')
      script.id = 'google-gsi-script'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = init
      document.body.appendChild(script)
    }
  }, [clientId, port, router])

  if (!clientId) {
    return (
      <p className="text-xs text-gray-500 text-center">
        Google sign-in is not configured.
      </p>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={divRef} />
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  )
}
