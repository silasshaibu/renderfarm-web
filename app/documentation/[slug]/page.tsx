'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ALL_DOCS, SIDEBAR_TREE, SEARCH_INDEX,
  type DocPage, type DocSection, type Block, type SearchEntry,
} from '@/lib/docs-content'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tok() {
  return typeof window !== 'undefined' ? (localStorage.getItem('rf_token') ?? '') : ''
}

// ─── Search (sidebar) ────────────────────────────────────────────────────────

interface SearchResult { slug: string; title: string; sectionId: string; sectionHeading: string }

function useSidebarSearch(query: string): SearchResult[] {
  return useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase().trim()
    const results: SearchResult[] = []
    const seen = new Set<string>()
    for (const entry of SEARCH_INDEX) {
      const key = `${entry.slug}/${entry.sectionId}`
      if (seen.has(key)) continue
      if (entry.sectionHeading.toLowerCase().includes(q) || entry.text.includes(q)) {
        seen.add(key)
        results.push({ slug: entry.slug, title: entry.title, sectionId: entry.sectionId, sectionHeading: entry.sectionHeading })
        if (results.length >= 6) break
      }
    }
    return results
  }, [query])
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button type="button" onClick={copy}
      className={`docs-code-copy ${copied ? 'docs-code-copy--done' : ''}`}
      title="Copy to clipboard" aria-label="Copy code">
      {copied ? '✓' : 'Copy'}
    </button>
  )
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function RenderBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'p': return (
      <p className="docs-p">{block.text}</p>
    )
    case 'ul': return (
      <ul className="docs-ul">
        {block.items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    )
    case 'ol': return (
      <ol className="docs-ol">
        {block.items.map((item, i) => <li key={i}>{item}</li>)}
      </ol>
    )
    case 'note': return (
      <div className="docs-note">{block.text}</div>
    )
    case 'warning': return (
      <div className="docs-warning">{block.text}</div>
    )
    case 'code': return (
      <div className="docs-code-wrap">
        {block.lang && <span className="docs-code-lang">{block.lang}</span>}
        <CopyButton text={block.code} />
        <pre className="docs-pre"><code>{block.code}</code></pre>
      </div>
    )
    case 'table': return (
      <div className="overflow-auto mb-4">
        <table className="docs-table w-full text-sm border-collapse">
          <thead>
            <tr>
              {block.headers.map((h, i) => <th key={i} className="docs-th">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="docs-tr">
                {row.map((cell, ci) => <td key={ci} className="docs-td">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    case 'download': return (
      <div className="docs-download-box">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        <div>
          <a href={block.href} className="docs-download-link">{block.label}</a>
          {block.note && <p className="text-xs text-gray-500 mt-0.5">{block.note}</p>}
        </div>
      </div>
    )
    default: return null
  }
}

// ─── Section renderer ─────────────────────────────────────────────────────────

function RenderSection({ section, extraContent }: { section: DocSection; extraContent?: React.ReactNode }) {
  const Tag = section.level === 2 ? 'h2' : 'h3'
  return (
    <section id={section.id} className={section.level === 2 ? 'docs-section' : 'docs-subsection'}>
      <Tag className={section.level === 2 ? 'docs-h2' : 'docs-h3'}>{section.heading}</Tag>
      {section.blocks.map((b, i) => <RenderBlock key={i} block={b} />)}
      {extraContent}
    </section>
  )
}

// ─── Live data for Supported Software ────────────────────────────────────────

interface BlenderPkg { id: string; label: string; version: string; status: string; notes: string }
interface InstanceType { id: string; label: string; instance: string; gcp_type: string; gpu_memory: string; vcpu: number; ram_gb: number }

function SupportedSoftwareExtra({ sectionId }: { sectionId: string }) {
  const [pkgs,  setPkgs]  = useState<BlenderPkg[] | null>(null)
  const [insts, setInsts] = useState<InstanceType[] | null>(null)

  useEffect(() => {
    const headers = { Authorization: `Bearer ${tok()}` }
    fetch('/api/packages', { headers }).then(r => r.ok ? r.json() : []).then(setPkgs).catch(() => setPkgs([]))
    fetch('/api/enterprise/instances', { headers }).then(r => r.ok ? r.json() : []).then(setInsts).catch(() => setInsts([]))
  }, [])

  if (sectionId === 'blender-versions') {
    if (!pkgs) return <p className="text-xs text-gray-600 animate-pulse">Loading packages…</p>
    return (
      <div className="overflow-auto mb-4">
        <table className="docs-table w-full text-sm border-collapse">
          <thead><tr><th className="docs-th">Version</th><th className="docs-th">Status</th><th className="docs-th">Notes</th></tr></thead>
          <tbody>
            {pkgs.map(p => (
              <tr key={p.id} className="docs-tr">
                <td className="docs-td font-medium">{p.label}</td>
                <td className="docs-td">
                  <span className={`docs-status-badge docs-status-badge--${p.status.toLowerCase()}`}>{p.status}</span>
                </td>
                <td className="docs-td text-gray-500">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (sectionId === 'instance-types') {
    if (!insts) return <p className="text-xs text-gray-600 animate-pulse">Loading instances…</p>
    return (
      <div className="overflow-auto mb-4">
        <table className="docs-table w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="docs-th">Label</th>
              <th className="docs-th">vCPU</th>
              <th className="docs-th">Memory</th>
              <th className="docs-th">GPU</th>
              <th className="docs-th">Type</th>
              <th className="docs-th">GCP Machine</th>
            </tr>
          </thead>
          <tbody>
            {insts.map(m => (
              <tr key={m.id} className="docs-tr">
                <td className="docs-td font-medium">{m.label}</td>
                <td className="docs-td">{m.vcpu} cores</td>
                <td className="docs-td">{m.ram_gb} GB</td>
                <td className="docs-td">{m.gpu_memory || '—'}</td>
                <td className="docs-td">{m.instance}</td>
                <td className="docs-td font-mono text-xs text-gray-500">{m.gcp_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}

// ─── Left Sidebar ─────────────────────────────────────────────────────────────

function DocSidebar({ activeSlug, activeSection, searchQuery, setSearchQuery }: {
  activeSlug: string; activeSection: string
  searchQuery: string; setSearchQuery: (v: string) => void
}) {
  const results = useSidebarSearch(searchQuery)

  return (
    <aside className="docs-sidebar">
      {/* Search */}
      <div className="docs-sidebar-search">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" className="text-gray-500 shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input type="search" placeholder="Search docs…" value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="docs-sidebar-search-input" aria-label="Search documentation" />
      </div>

      {/* Search results */}
      {searchQuery.trim().length >= 2 ? (
        <div className="flex flex-col gap-0.5 mt-2">
          {results.length === 0
            ? <p className="text-xs text-gray-600 px-2 py-2">No results</p>
            : results.map(r => (
              <Link key={`${r.slug}-${r.sectionId}`}
                href={`/documentation/${r.slug}#${r.sectionId}`}
                onClick={() => setSearchQuery('')}
                className="docs-sidebar-search-result">
                <span className="text-xs text-blue-400">{r.title}</span>
                <span className="text-xs text-gray-500 ml-1">› {r.sectionHeading}</span>
              </Link>
            ))
          }
        </div>
      ) : (
        <nav aria-label="Documentation sections">
          {SIDEBAR_TREE.map(entry => (
            <div key={entry.slug} className="mb-1">
              <Link href={`/documentation/${entry.slug}`}
                className={`docs-sidebar-item ${activeSlug === entry.slug ? 'docs-sidebar-item--active' : ''}`}>
                {entry.label}
                {entry.beta && (
                  <span className="ml-1.5 text-[10px] font-bold text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded">BETA</span>
                )}
              </Link>
              {/* Sub-items: only show for active page */}
              {activeSlug === entry.slug && entry.children.length > 0 && (
                <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
                  {entry.children.map(child => (
                    <a key={child.id} href={`#${child.id}`}
                      className={`docs-sidebar-sub ${activeSection === child.id ? 'docs-sidebar-sub--active' : ''}`}>
                      {child.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}
    </aside>
  )
}

// ─── Right "On this page" sidebar ────────────────────────────────────────────

function OnThisPage({ sections, activeId }: { sections: DocSection[]; activeId: string }) {
  const h2s = sections.filter(s => s.level === 2)
  if (h2s.length < 2) return null
  return (
    <aside className="docs-onpage">
      <p className="docs-onpage-title">On this page</p>
      <nav>
        {h2s.map(s => (
          <a key={s.id} href={`#${s.id}`}
            className={`docs-onpage-link ${activeId === s.id ? 'docs-onpage-link--active' : ''}`}>
            {s.heading}
          </a>
        ))}
      </nav>
    </aside>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocSubPage() {
  const { slug } = useParams<{ slug: string }>()
  const doc: DocPage | undefined = ALL_DOCS[slug as string]

  const [activeSection, setActiveSection] = useState('')
  const [searchQuery,   setSearchQuery]   = useState('')
  const observersRef = useRef<IntersectionObserver | null>(null)

  // Scroll spy: highlight the h2 section that is currently in view
  useEffect(() => {
    if (!doc) return
    if (observersRef.current) observersRef.current.disconnect()

    const h2Ids = doc.sections.filter(s => s.level === 2).map(s => s.id)
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        }
      },
      { rootMargin: '-10% 0px -60% 0px', threshold: 0 },
    )
    observersRef.current = obs

    // Small delay to let DOM render
    const tid = setTimeout(() => {
      for (const id of h2Ids) {
        const el = document.getElementById(id)
        if (el) obs.observe(el)
      }
    }, 100)

    return () => { clearTimeout(tid); obs.disconnect() }
  }, [doc, slug])

  if (!doc) {
    return (
      <div className="flex flex-col gap-4 max-w-3xl">
        <Link href="/documentation" className="docs-back">← Documentation</Link>
        <h1 className="text-xl font-semibold text-white">Page not found</h1>
        <p className="text-sm text-gray-400">The documentation page &quot;{slug}&quot; does not exist.</p>
      </div>
    )
  }

  return (
    <div className="docs-page-layout">
      {/* Left sidebar */}
      <DocSidebar
        activeSlug={slug as string}
        activeSection={activeSection}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Main content */}
      <main className="docs-page-main">
        <Link href="/documentation" className="docs-back">← Documentation</Link>

        <div className="flex items-center gap-3 mt-4 mb-1">
          <h1 className="docs-h1">{doc.title}</h1>
          {doc.beta && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-400/15 text-yellow-300 border border-yellow-400/30">
              BETA
            </span>
          )}
        </div>

        {doc.intro && <p className="text-sm text-gray-400 mb-8 leading-relaxed">{doc.intro}</p>}

        {doc.sections.map(section => (
          <RenderSection
            key={section.id}
            section={section}
            extraContent={
              doc.liveData && (section.id === 'blender-versions' || section.id === 'instance-types')
                ? <SupportedSoftwareExtra sectionId={section.id} />
                : undefined
            }
          />
        ))}
      </main>

      {/* Right "On this page" */}
      <OnThisPage sections={doc.sections} activeId={activeSection} />
    </div>
  )
}
