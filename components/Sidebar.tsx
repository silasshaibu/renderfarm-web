'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SUNBURST_RAYS } from '@/lib/sunburst'

// ---------------------------------------------------------------------------
// Nav item definition
// ---------------------------------------------------------------------------
interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------
const IconJobs = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="16" />
    <line x1="10" y1="14" x2="14" y2="14" />
  </svg>
)

const IconUsage = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const IconCalculator = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="8" y1="6" x2="16" y2="6" />
    <line x1="8"  y1="10" x2="8"  y2="10" strokeWidth="3" strokeLinecap="round" />
    <line x1="12" y1="10" x2="12" y2="10" strokeWidth="3" strokeLinecap="round" />
    <line x1="16" y1="10" x2="16" y2="10" strokeWidth="3" strokeLinecap="round" />
    <line x1="8"  y1="14" x2="8"  y2="14" strokeWidth="3" strokeLinecap="round" />
    <line x1="12" y1="14" x2="12" y2="14" strokeWidth="3" strokeLinecap="round" />
    <line x1="16" y1="14" x2="16" y2="14" strokeWidth="3" strokeLinecap="round" />
    <line x1="8"  y1="18" x2="8"  y2="18" strokeWidth="3" strokeLinecap="round" />
    <line x1="12" y1="18" x2="12" y2="18" strokeWidth="3" strokeLinecap="round" />
    <line x1="16" y1="18" x2="16" y2="18" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

const IconProfile = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconAdmin = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
  </svg>
)

const IconEnterprise = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="1" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
  </svg>
)

const IconWrangler = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
)

const IconDocs = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
)

const IconSupport = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" strokeLinecap="round" />
  </svg>
)

// ---------------------------------------------------------------------------
// Sunburst logo — uses shared pre-computed rays from lib/sunburst.ts
// ---------------------------------------------------------------------------
const SunburstIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <circle cx="14" cy="14" r="5" className="sidebar-icon-fill" />
    {SUNBURST_RAYS.map((ray, i) => (
      <line key={i}
        x1={ray.x1} y1={ray.y1}
        x2={ray.x2} y2={ray.y2}
        className="sidebar-icon-stroke"
        strokeWidth={ray.thick ? 2 : 1.2}
        strokeLinecap="round"
      />
    ))}
  </svg>
)

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------
const NAV_ITEMS: NavItem[] = [
  { label: 'Jobs',             href: '/',                 icon: <IconJobs /> },
  { label: 'Usage',            href: '/usage',            icon: <IconUsage /> },
  { label: 'Calculator',       href: '/calculator',       icon: <IconCalculator /> },
  { label: 'Profile',          href: '/profile',          icon: <IconProfile /> },
  { label: 'Admin',            href: '/admin',            icon: <IconAdmin /> },
  { label: 'Enterprise',       href: '/enterprise',       icon: <IconEnterprise /> },
  { label: 'Virtual Wrangler', href: '/virtual-wrangler', icon: <IconWrangler /> },
  { label: 'Documentation',    href: '/documentation',    icon: <IconDocs /> },
  { label: 'Support',          href: '/support',          icon: <IconSupport /> },
]

// ---------------------------------------------------------------------------
// Sidebar component
// ---------------------------------------------------------------------------
interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={`sidebar-root ${isOpen ? 'sidebar-mobile-open' : 'sidebar-mobile-closed'}`}
      aria-label="Main navigation"
    >
      {/* Logo row */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <SunburstIcon />
          <span className="sidebar-logo-text">CONDUCTOR</span>
        </div>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="md:hidden text-gray-500 hover:text-white transition-colors p-1 -mr-1 rounded"
            aria-label="Close navigation menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-3 overflow-y-auto" aria-label="Site navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={[
                'sidebar-nav-link',
                isActive ? 'sidebar-nav-link--active' : 'sidebar-nav-link--idle',
              ].join(' ')}
            >
              {isActive && <span className="sidebar-active-bar" aria-hidden="true" />}
              <span className={isActive ? 'text-white' : 'text-gray-500'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Version footer */}
      <div className="px-5 py-4 border-t border-white/5">
        <p className="text-xs text-gray-600">v2.26.0</p>
      </div>
    </aside>
  )
}
