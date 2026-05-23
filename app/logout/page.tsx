'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { clearToken } from '@/lib/auth'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    clearToken()
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#111' }}>
      <p className="text-gray-500 text-sm">Signing out…</p>
    </div>
  )
}
