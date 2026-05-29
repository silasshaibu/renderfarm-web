'use client'
import { useEffect, useState, useCallback } from 'react'
import styles from '../../cms.module.css'

interface Entry {
  id: string; actorEmail: string; actorType: string; action: string
  targetType: string; targetId: string; details: Record<string, unknown>
  ip: string; severity: string; createdAt: string
}

const LIMIT = 100
const SEV_CLASS: Record<string, string> = {
  info:     styles.sevInfo,
  warning:  styles.sevWarning,
  critical: styles.sevCritical,
}

export default function CmsAuditLogPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal]     = useState(0)
  const [severity, setSeverity] = useState('')
  const [action, setAction]   = useState('')
  const [offset, setOffset]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ severity, action, limit: String(LIMIT), offset: String(offset) })
    const res = await fetch(`/api/cms/audit-log?${p}`)
    const d = await res.json()
    setEntries(d.entries ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [severity, action, offset])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Audit Log</h1>
          <p className={styles.pageSubtitle}>{total} entries — append-only</p>
        </div>
      </div>

      <div className={styles.searchRow}>
        <input className={styles.searchInput} placeholder="Filter by action…" value={action} onChange={e => { setAction(e.target.value); setOffset(0) }} />
        <select className={styles.select} value={severity} onChange={e => { setSeverity(e.target.value); setOffset(0) }}>
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : entries.length === 0
            ? <p className={styles.empty}>No entries found.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Time</th><th>Actor</th><th>Action</th>
                    <th>Target</th><th>Severity</th><th>IP</th><th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id}>
                      <td style={{ color: '#555570', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td style={{ color: '#9999bb' }}>{e.actorEmail || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.action}</td>
                      <td style={{ color: '#555570', fontSize: 12 }}>
                        {e.targetType && `${e.targetType} ${e.targetId}`}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${e.severity === 'critical' ? styles.badgeRed : e.severity === 'warning' ? styles.badgeYellow : styles.badgeBlue}`}>
                          {e.severity}
                        </span>
                      </td>
                      <td style={{ color: '#555570', fontSize: 12 }}>{e.ip || '—'}</td>
                      <td>
                        {Object.keys(e.details).length > 0 && (
                          <button
                            className={styles.btnGhost}
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                          >
                            {expanded === e.id ? 'Hide' : 'View'}
                          </button>
                        )}
                        {expanded === e.id && (
                          <pre style={{ fontSize: 11, color: '#9999bb', marginTop: 8, whiteSpace: 'pre-wrap', maxWidth: 300 }}>
                            {JSON.stringify(e.details, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>

      <div className={styles.pagination}>
        <button className={styles.pageBtn} disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - LIMIT))}>← Prev</button>
        <span className={styles.pageInfo}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button className={styles.pageBtn} disabled={offset + LIMIT >= total} onClick={() => setOffset(o => o + LIMIT)}>Next →</button>
      </div>
    </div>
  )
}
