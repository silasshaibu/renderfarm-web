'use client'

import { useEffect, useState } from 'react'

interface Announcement {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error' | string
  dismissible: boolean
}

const STYLES: Record<string, string> = {
  info:    'bg-blue-950/50 border-blue-700/50 text-blue-200',
  success: 'bg-green-950/50 border-green-700/50 text-green-200',
  warning: 'bg-amber-950/50 border-amber-700/50 text-amber-200',
  error:   'bg-red-950/50 border-red-700/50 text-red-200',
}

const ICONS: Record<string, string> = {
  info: 'ℹ', success: '✓', warning: '⚠', error: '⛔',
}

const DISMISS_KEY = 'rf_dismissed_announcements'

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') } catch { return [] }
}

export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([])

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('rf_token') ?? '' : ''
    if (!token) return
    fetch('/api/announcements/active', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: Announcement[]) => {
        const dismissed = getDismissed()
        setItems(data.filter(a => !dismissed.includes(a.id)))
      })
      .catch(() => null)
  }, [])

  const dismiss = (id: string) => {
    const next = [...getDismissed(), id]
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    setItems(prev => prev.filter(a => a.id !== id))
  }

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      {items.map(a => (
        <div key={a.id}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-sm ${STYLES[a.type] ?? STYLES.info}`}>
          <span className="shrink-0 mt-0.5">{ICONS[a.type] ?? ICONS.info}</span>
          <div className="flex-1">
            <p className="font-medium">{a.title}</p>
            <p className="opacity-80 text-xs mt-0.5 whitespace-pre-line">{a.message}</p>
          </div>
          {a.dismissible && (
            <button type="button" onClick={() => dismiss(a.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
