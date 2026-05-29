'use client'
import { useEffect, useState, useCallback } from 'react'
import styles from '../../cms.module.css'

interface Job {
  id: string; jobNumber: number; title: string; status: string
  createdAt: string; userEmail: string; frameRange: string; chunkSize: number
}

const STATUS_CLASS: Record<string, string> = {
  success: styles.badgeGreen, running: styles.badgeBlue, syncing: styles.badgeBlue,
  failed: styles.badgeRed, cancelled: styles.badgeGray, queued: styles.badgeYellow,
}

const LIMIT = 50

export default function CmsJobsPage() {
  const [jobs, setJobs]     = useState<Job[]>([])
  const [total, setTotal]   = useState(0)
  const [q, setQ]           = useState('')
  const [statusF, setStatusF] = useState('')
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ q, status: statusF, limit: String(LIMIT), offset: String(offset) })
    const res = await fetch(`/api/cms/jobs?${p}`)
    const d = await res.json()
    setJobs(d.jobs ?? [])
    setTotal(d.total ?? 0)
    setLoading(false)
  }, [q, statusF, offset])

  useEffect(() => { load() }, [load])

  async function cancel(id: string) {
    if (!confirm('Cancel this job?')) return
    await fetch('/api/cms/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'cancel' }) })
    load()
  }

  async function del(id: string) {
    if (!confirm('Permanently delete this job?')) return
    await fetch('/api/cms/jobs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'delete' }) })
    load()
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Jobs</h1>
          <p className={styles.pageSubtitle}>{total} total</p>
        </div>
      </div>

      <div className={styles.searchRow}>
        <input className={styles.searchInput} placeholder="Search title, #, email…" value={q} onChange={e => { setQ(e.target.value); setOffset(0) }} />
        <select className={styles.select} value={statusF} onChange={e => { setStatusF(e.target.value); setOffset(0) }}>
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="queued">Queued</option>
        </select>
      </div>

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : jobs.length === 0
            ? <p className={styles.empty}>No jobs found.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th><th>Title</th><th>User</th><th>Status</th>
                    <th>Frames</th><th>Created</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(j => (
                    <tr key={j.id}>
                      <td style={{ color: '#555570' }}>#{j.jobNumber}</td>
                      <td>{j.title}</td>
                      <td style={{ color: '#9999bb' }}>{j.userEmail}</td>
                      <td><span className={`${styles.badge} ${STATUS_CLASS[j.status] ?? styles.badgeGray}`}>{j.status}</span></td>
                      <td style={{ color: '#555570' }}>{j.frameRange}</td>
                      <td style={{ color: '#555570', whiteSpace: 'nowrap' }}>{new Date(j.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(j.status === 'running' || j.status === 'queued') && (
                            <button className={styles.btnGhost} onClick={() => cancel(j.id)}>Cancel</button>
                          )}
                          <button className={styles.btnDanger} onClick={() => del(j.id)}>Delete</button>
                        </div>
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
