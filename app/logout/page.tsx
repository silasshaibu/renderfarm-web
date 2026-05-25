'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, clearToken } from '@/lib/auth'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    const token = getToken()

    // Revoke the session server-side (best-effort — don't block UI on failure)
    if (token) {
      fetch('/api/auth/logout', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {/* ignore network errors */})
    }

    clearToken()
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <p className="text-gray-500 text-sm">Signing out…</p>
    </div>
  )
}
