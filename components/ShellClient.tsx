'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

const YEAR = new Date().getFullYear()
const AUTH_PATHS = ['/login', '/logout', '/register']

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

export default function ShellClient({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (AUTH_PATHS.includes(pathname)) {
    return <>{children}</>
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

          <span className="text-white font-bold text-3xl">Silas</span>

          <div className="flex items-center gap-4 text-sm ml-auto">
            <CreditBadge />

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

        <main className="flex-1 overflow-auto px-4 md:px-6 py-5 md:py-6">
          {children}
        </main>

        <footer className="shrink-0 px-4 md:px-6 py-4 border-t border-white/5 text-xs text-gray-600">
          Renderfarm © {YEAR}
        </footer>
      </div>
    </div>
  )
}
