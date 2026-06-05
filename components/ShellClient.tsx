'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import AnnouncementBanner from './AnnouncementBanner'

const YEAR = new Date().getFullYear()
const AUTH_PATHS = ['/login', '/logout', '/register']

function deriveDisplayName(email: string): string {
  if (!email) return ''
  const local = (email.split('@')[0] ?? '').replace(/[0-9]+$/g, '')
  const parts = local.split(/[._-]+/).filter(Boolean)
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function UserGreeting() {
  const [name, setName] = useState('')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    if (!token) return
    fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((d: { firstName?: string; lastName?: string; accountName?: string; email?: string } | null) => {
        if (!d) return
        const full = [d.firstName, d.lastName].filter(Boolean).join(' ')
        setName(d.accountName || full || deriveDisplayName(d.email ?? ''))
      })
      .catch(() => null)
  }, [])

  return <span className="text-white font-bold text-3xl">{name || ' '}</span>
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CreditBadge() {
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    if (!token) return
    fetch('/api/profile/credits?pageSize=1', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((d: { balance?: number } | null) => {
        if (d?.balance != null) setBalance(d.balance)
      })
      .catch(() => null)
  }, [])

  if (balance === null) return null

  const color = balance > 10
    ? 'text-gray-300'
    : balance >= 5
    ? 'text-amber-400'
    : 'text-red-400'

  return (
    <span
      className={`text-xs font-mono ${color}`}
      title={balance <= 5 ? 'Credits running low. Add credits to continue rendering.' : undefined}
    >
      Credits: ${balance.toFixed(2)}
    </span>
  )
}

function isSuperAdminFromToken(): boolean {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') : null
    if (!token) return false
    return Boolean(JSON.parse(atob(token.split('.')[1]))?.isSuperAdmin)
  } catch { return false }
}

function UnderConstruction({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center text-center px-6 bg-[#0f1117]">
      <div className="text-5xl mb-4">🚧</div>
      <h1 className="text-2xl font-bold text-white mb-2">Under Construction</h1>
      <p className="text-gray-400 max-w-md whitespace-pre-line">
        {message || 'We’re making improvements and will be back shortly. Thanks for your patience.'}
      </p>
    </div>
  )
}

export default function ShellClient({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [maintenance, setMaintenance] = useState<{ on: boolean; message: string } | null>(null)
  const superAdmin = isSuperAdminFromToken()

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    if (!token) return
    fetch('/api/site-status', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((s: { maintenanceMode?: boolean; maintenanceMessage?: string } | null) => {
        if (s) setMaintenance({ on: Boolean(s.maintenanceMode), message: s.maintenanceMessage ?? '' })
      })
      .catch(() => null)
  }, [])

  if (AUTH_PATHS.includes(pathname) || pathname.startsWith('/cms')) {
    return <>{children}</>
  }

  // Maintenance gate — non-super-admins see Under Construction
  if (maintenance?.on && !superAdmin) {
    return <UnderConstruction message={maintenance.message} />
  }

  return (
    <div className="shell-body flex min-h-screen">

      {sidebarOpen && (
        <div
          className="shell-sidebar-backdrop md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="shell-main-area flex flex-col flex-1">

        <header className="shell-topbar flex items-center px-4 md:px-6 py-3 shrink-0">
          <button
            type="button"
            className="md:hidden text-gray-400 hover:text-white transition-colors p-1 -ml-1 rounded mr-3"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <HamburgerIcon />
          </button>

          <UserGreeting />

          <div className="flex items-center gap-4 text-sm ml-auto">

            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <a href="/logout" className="text-gray-500 hover:text-red-400 transition-colors" aria-label="Log out">
                Log out
              </a>
            </div>
          </div>
        </header>

        {maintenance?.on && superAdmin && (
          <div className="bg-amber-950/60 border-b border-amber-700/50 text-amber-200 text-xs px-4 md:px-6 py-2">
            ⚠ Maintenance mode is ON — regular users see “Under Construction”. You have access as a super admin.
          </div>
        )}

        <main className="flex-1 overflow-auto px-4 md:px-6 py-5 md:py-6">
          <AnnouncementBanner />
          {children}
        </main>

        <footer className="shrink-0 px-4 md:px-6 py-4 border-t border-white/5 text-xs text-gray-600">
          Renderfarm © {YEAR}
        </footer>
      </div>
    </div>
  )
}
