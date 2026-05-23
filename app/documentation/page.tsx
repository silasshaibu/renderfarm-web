// Documentation page — matches the Conductor docs site style (teal header, light body)
// Rendered inside the dashboard shell (sidebar + topbar remain visible)

import Link from 'next/link'
import { SUNBURST_RAYS } from '@/lib/sunburst'

const QUICK_LINKS = [
  {
    title: 'Blender Submitter',
    desc: 'Boost your Blender projects with the speed and efficiency of cloud rendering.',
    href: 'https://docs.conductortech.com/blender',
  },
  {
    title: 'Virtual Wrangler',
    desc: 'Configure the automated render wrangler to look after your jobs.',
    href: '/virtual-wrangler',
  },
  {
    title: 'Maya Submitter',
    desc: 'Render Autodesk Maya jobs in the cloud.',
    href: 'https://docs.conductortech.com/maya',
  },
  {
    title: 'Cinema 4D Submitter',
    desc: 'Render C4d scenes with Redshift.',
    href: 'https://docs.conductortech.com/c4d',
  },
  {
    title: 'Companion App',
    desc: 'Includes a GUI downloader, and Submission kit.',
    href: 'https://docs.conductortech.com/companion',
  },
  {
    title: 'Supported Software',
    desc: 'Find out what renderers and plugins are available.',
    href: 'https://docs.conductortech.com/software',
  },
  {
    title: 'FAQ',
    desc: 'Get answers to frequently asked questions.',
    href: 'https://docs.conductortech.com/faq',
  },
]

const NAV_LINKS = ['Home', 'Render', 'AI (Beta)', 'Support']

export default function DocumentationPage() {
  return (
    // Full-bleed docs wrapper — overrides the dark shell background
    <div className="docs-wrapper">

      {/* Teal header */}
      <header className="docs-header">
        <div className="docs-header-inner">
          <div className="flex items-center gap-2">
            {/* Conductor logo mark */}
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="5" fill="#fff" />
              {SUNBURST_RAYS.map((ray, i) => (
                <line key={i} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2}
                  stroke="#fff" strokeWidth={ray.thick ? 2 : 1.2} strokeLinecap="round" />
              ))}
            </svg>
            <span className="text-white font-semibold text-base">Conductor Documentation</span>
          </div>

          {/* Search */}
          <div className="docs-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" className="text-gray-400" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" placeholder="Search" aria-label="Search documentation"
              className="docs-search-input" />
          </div>
        </div>

        {/* Nav */}
        <nav className="docs-nav" aria-label="Documentation navigation">
          {NAV_LINKS.map((n) => (
            <a key={n} href="#" className={`docs-nav-link ${n === 'Home' ? 'docs-nav-link--active' : ''}`}>
              {n}
            </a>
          ))}
        </nav>
      </header>

      {/* Body */}
      <div className="docs-body">
        {/* Hero */}
        <section className="docs-hero">
          <div>
            <h1 className="docs-hero-title">Welcome to the Conductor<br />documentation site.</h1>
            <p className="docs-hero-sub">
              Here you&apos;ll find everything you need to get productive with Conductor.
            </p>
            <div className="flex gap-3 mt-6">
              <a href="https://docs.conductortech.com" target="_blank" rel="noopener noreferrer"
                className="docs-btn-solid">Get started</a>
              <Link href="/support" className="docs-btn-outline">Open a Ticket</Link>
            </div>
          </div>
        </section>

        {/* Quick links sidebar */}
        <aside className="docs-quicklinks">
          <p className="text-sm font-semibold text-gray-600 mb-4">
            Quick links to our most visited pages and new features.
          </p>
          <ul className="flex flex-col gap-4">
            {QUICK_LINKS.map((link) => (
              <li key={link.title}>
                <a href={link.href}
                  target={link.href.startsWith('http') ? '_blank' : undefined}
                  rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="docs-quicklink-title">
                  {link.title}
                </a>
                <p className="docs-quicklink-desc">{link.desc}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
