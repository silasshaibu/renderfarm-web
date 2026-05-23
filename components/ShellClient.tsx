'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

// Evaluated once at build/import time — never drifts between SSR and hydration
const YEAR = new Date().getFullYear()

// Pages that should NOT have the sidebar/topbar shell
const AUTH_PATHS = ['/login', '/logout', '/register']

// Hamburger icon
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

export default function ShellClient({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Auth pages get no shell at all — just the page itself
  if (AUTH_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="shell-body flex min-h-screen">

      {/* Mobile backdrop — only rendered when sidebar is open */}
      {sidebarOpen && (
        <div
          className="shell-sidebar-backdrop md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Right-hand content area */}
      <div className="shell-main-area flex flex-col flex-1">

        {/* Top bar */}
        <header className="shell-topbar flex items-center px-4 md:px-6 py-3 shrink-0">
          {/* Hamburger — visible only on mobile */}
          <button
            type="button"
            className="md:hidden text-gray-400 hover:text-white transition-colors p-1 -ml-1 rounded mr-3"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <HamburgerIcon />
          </button>

          {/* Silas name — left side */}
          <span className="text-white font-bold text-3xl">Silas</span>

          {/* Logout — pushed to the far right */}
          <div className="flex items-center gap-2 text-sm ml-auto">
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
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto px-4 md:px-6 py-5 md:py-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="shrink-0 px-4 md:px-6 py-4 border-t border-white/5 text-xs text-gray-600">
          Renderfarm © {YEAR}
        </footer>
      </div>
    </div>
  )
}
