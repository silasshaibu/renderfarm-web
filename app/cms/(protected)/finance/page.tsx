'use client'
import { useEffect, useState } from 'react'
import styles from '../../cms.module.css'

interface CreditRow {
  id: string; userId: string; userEmail: string; amount: number
  description: string; grantedBy: string | null; createdAt: string
}

export default function CmsFinancePage() {
  const [rows, setRows]       = useState<CreditRow[]>([])
  const [summary, setSummary] = useState({ granted: 0, consumed: 0, outstanding: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/cms/finance' + (q ? `?q=${encodeURIComponent(q)}` : ''))
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setSummary(d.summary ?? { granted: 0, consumed: 0, outstanding: 0 }) })
      .finally(() => setLoading(false))
  }, [q])

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Finance</h1>
          <p className={styles.pageSubtitle}>Credits ledger overview</p>
        </div>
      </div>

      <div className={styles.statGrid} style={{ marginBottom: 24 }}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Granted</div>
          <div className={styles.statValue}>${summary.granted.toFixed(2)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Total Consumed</div>
          <div className={styles.statValue} style={{ color: '#f87171' }}>${summary.consumed.toFixed(2)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Outstanding (Owed)</div>
          <div className={styles.statValue} style={{ color: summary.outstanding < 0 ? '#facc15' : '#4ade80' }}>
            ${summary.outstanding.toFixed(2)}
          </div>
        </div>
      </div>

      <div className={styles.searchRow}>
        <input className={styles.searchInput} placeholder="Filter by email or description…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : rows.length === 0
            ? <p className={styles.empty}>No transactions found.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>User</th><th>Amount</th><th>Description</th><th>By</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ color: '#9999bb' }}>{r.userEmail}</td>
                      <td style={{ color: r.amount >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {r.amount >= 0 ? '+' : ''}{r.amount.toFixed(2)}
                      </td>
                      <td style={{ color: '#c0c0e0' }}>{r.description}</td>
                      <td style={{ color: '#555570', fontSize: 12 }}>{r.grantedBy ?? '—'}</td>
                      <td style={{ color: '#555570', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>
    </div>
  )
}
