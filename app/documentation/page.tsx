'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { QUICK_CARDS, SEARCH_INDEX } from '@/lib/docs-content'

// ─── Card icons ───────────────────────────────────────────────────────────────

function CardIcon({ name }: { name: string }) {
  const cls = 'text-blue-400'
  switch (name) {
    case 'blender': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.51 13.214c.046-.8.438-1.538 1.075-2.026l6.31-4.922c.46-.358 1.068-.358 1.527 0 .46.359.46.94 0 1.299l-6.31 4.922c-.46.359-.46.94 0 1.299.46.358 1.068.358 1.527 0l.607-.474 1.073 2.474-.606.474c-1.15.896-2.716 1.1-4.07.52-1.354-.58-2.178-1.866-2.133-3.566zm-1.97-5.014C10.54 6.592 9.284 5 7.5 5 5.716 5 4.46 6.592 4.46 8.2S5.716 11.4 7.5 11.4c1.284 0 2.413-.798 2.888-2.03H5.946V8.2h5.054c.028.178.042.36.042.545 0 .126-.009.25-.025.373L12.51 8.2h1.053c-.034-2.37-1.99-4.2-4.06-4.2-2.21 0-4 1.82-4 4.067s1.79 4.066 4 4.066c.877 0 1.688-.283 2.344-.762l-.806-1.857c-.41.258-.872.406-1.54.406z"/>
      </svg>
    )
    case 'robot': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M12 2v4M8 15h.01M16 15h.01"/><circle cx="12" cy="7" r="1.5"/><path d="M8 11V9a4 4 0 0 1 8 0v2"/>
      </svg>
    )
    case 'rocket': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
      </svg>
    )
    case 'desktop': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
      </svg>
    )
    case 'list': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
      </svg>
    )
    case 'question': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
      </svg>
    )
    case 'code': return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
      </svg>
    )
    default: return (
      <svg className={cls} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/>
      </svg>
    )
  }
}

// ─── Search results ───────────────────────────────────────────────────────────

interface SearchResult {
  slug:           string
  title:          string
  sectionId:      string
  sectionHeading: string
  excerpt:        string
}

function highlight(text: string, query: string): string {
  // Returns plain text with query terms wrapped in <mark> placeholders
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '**$1**')
}

function useSearch(query: string): SearchResult[] {
  return useMemo(() => {
    if (query.trim().length < 2) return []
    const q = query.toLowerCase().trim()
    const results: SearchResult[] = []
    const seen = new Set<string>()

    for (const entry of SEARCH_INDEX) {
      const key = `${entry.slug}/${entry.sectionId}`
      if (seen.has(key)) continue

      const headingMatch = entry.sectionHeading.toLowerCase().includes(q)
      const textMatch    = entry.text.includes(q)

      if (headingMatch || textMatch) {
        seen.add(key)
        // Build excerpt: first 120 chars around the match
        let excerpt = ''
        const idx = entry.text.indexOf(q)
        if (idx >= 0) {
          const start = Math.max(0, idx - 40)
          excerpt = (start > 0 ? '…' : '') + entry.text.slice(start, idx + q.length + 80).replace(/\s+/g, ' ')
          if (entry.text.length > idx + q.length + 80) excerpt += '…'
        }
        results.push({ slug: entry.slug, title: entry.title, sectionId: entry.sectionId, sectionHeading: entry.sectionHeading, excerpt })
        if (results.length >= 8) break
      }
    }
    return results
  }, [query])
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentationPage() {
  const [search, setSearch] = useState('')
  const results = useSearch(search)

  return (
    <div className="flex flex-col gap-8 max-w-5xl">

      {/* Title */}
      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Documentation</h1>
        <p className="mt-1 text-sm text-gray-400">
          Everything you need to get productive with your render farm.
        </p>
      </div>

      {/* CTA buttons */}
      <div className="flex items-center gap-3">
        <a href="#get-started-section"
          className="docs-hub-btn-primary">
          Get Started
        </a>
        <Link href="/support" className="docs-hub-btn-outline">
          Open a Support Ticket
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <div className="docs-hub-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" className="text-gray-500 shrink-0" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            placeholder="Search documentation…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="docs-hub-search-input"
            aria-label="Search documentation"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')}
              className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
          )}
        </div>

        {/* Search results dropdown */}
        {search.trim().length >= 2 && (
          <div className="docs-hub-search-results">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500">No results for &quot;{search}&quot;</p>
            ) : results.map(r => (
              <Link
                key={`${r.slug}-${r.sectionId}`}
                href={`/documentation/${r.slug}#${r.sectionId}`}
                onClick={() => setSearch('')}
                className="docs-hub-result-item">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-blue-400">{r.title}</span>
                  <span className="text-xs text-gray-500">›</span>
                  <span className="text-xs text-gray-300">{r.sectionHeading}</span>
                </div>
                {r.excerpt && (
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{r.excerpt}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links heading */}
      <div id="get-started-section">
        <h2 className="text-base font-semibold text-gray-200 mb-4">
          Quick links to the most visited pages.
        </h2>

        {/* Cards grid */}
        <div className="docs-hub-grid">
          {QUICK_CARDS.map(card => (
            <Link key={card.slug} href={`/documentation/${card.slug}`}
              className="docs-hub-card">
              <div className="flex items-center gap-3 mb-3">
                <div className="docs-hub-card-icon">
                  <CardIcon name={card.icon} />
                </div>
                <h3 className="text-sm font-semibold text-gray-200">{card.title}</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
