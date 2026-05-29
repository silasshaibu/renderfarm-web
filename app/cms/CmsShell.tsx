'use client'
import { useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import styles from './cms.module.css'

interface Admin { id: number; email: string }

const NAV = [
  { href: '/cms',              label: 'Dashboard',      icon: '◈' },
  { href: '/cms/users',        label: 'Users',          icon: '👤' },
  { href: '/cms/jobs',         label: 'Jobs',           icon: '🎬' },
  { href: '/cms/finance',      label: 'Finance',        icon: '💳' },
  { href: '/cms/announcements',label: 'Announcements',  icon: '📢' },
  { href: '/cms/config',       label: 'Platform Config',icon: '⚙' },
  { href: '/cms/audit-log',    label: 'Audit Log',      icon: '📋' },
  { href: '/cms/superadmins',  label: 'Super Admins',   icon: '🔑' },
  { href: '/cms/profile',      label: 'Profile',        icon: '🛡' },
]

export default function CmsShell({
  children,
  admin,
}: {
  children: React.ReactNode
  admin: Admin
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut]   = useState(false)

  const logout = useCallback(async () => {
    setLoggingOut(true)
    await fetch('/api/cms/auth/logout', { method: 'POST' }).catch(() => null)
    router.push('/cms/login')
  }, [router])

  const isActive = (href: string) => {
    if (href === '/cms') return pathname === '/cms'
    return pathname.startsWith(href)
  }

  return (
    <div className={styles.shell}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarLogo}>⚙</span>
          <span className={styles.sidebarTitle}>CMS</span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive(item.href) ? styles.navActive : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.adminInfo}>
            <span className={styles.adminAvatar}>{admin.email[0].toUpperCase()}</span>
            <span className={styles.adminEmail}>{admin.email}</span>
          </div>
          <button
            className={styles.logoutBtn}
            onClick={logout}
            disabled={loggingOut}
          >
            {loggingOut ? '…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button
            className={styles.menuBtn}
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <div className={styles.topbarRight}>
            <span className={styles.topbarEnv}>SUPER ADMIN</span>
            <Link href="/" target="_blank" className={styles.topbarLink}>
              ↗ View Site
            </Link>
          </div>
        </header>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  )
}
