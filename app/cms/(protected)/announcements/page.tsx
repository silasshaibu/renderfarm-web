'use client'
import { useEffect, useState, FormEvent } from 'react'
import styles from '../../cms.module.css'

interface Announcement {
  id: string; title: string; message: string; type: string
  audience: string; isActive: boolean; showFrom: string; showUntil: string | null
  dismissible: boolean; createdAt: string
}

export default function CmsAnnouncementsPage() {
  const [items, setItems]     = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', type: 'info', audience: 'all', dismissible: true, showUntil: '' })
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/cms/announcements').then(r => r.json()).then(setItems).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const res = await fetch('/api/cms/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, showUntil: form.showUntil || null }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg(d.message ?? 'Error'); return }
    setMsg('Created!')
    setShowForm(false)
    setForm({ title: '', message: '', type: 'info', audience: 'all', dismissible: true, showUntil: '' })
    load()
  }

  async function doAction(id: string, action: string) {
    await fetch('/api/cms/announcements', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) })
    load()
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Announcements</h1>
          <p className={styles.pageSubtitle}>Banners shown to users in the dashboard</p>
        </div>
        <button className={styles.btn} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ New Announcement'}
        </button>
      </div>

      {showForm && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input className={styles.formInput} required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type</label>
                <select className={styles.select} style={{ width: '100%' }} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Message</label>
              <textarea className={styles.formTextarea} required value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Audience</label>
                <select className={styles.select} style={{ width: '100%' }} value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))}>
                  <option value="all">All users</option>
                  <option value="admins">Admins only</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Show Until (optional)</label>
                <input className={styles.formInput} type="datetime-local" value={form.showUntil} onChange={e => setForm(f => ({ ...f, showUntil: e.target.value }))} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Dismissible</label>
                <select className={styles.select} style={{ width: '100%' }} value={form.dismissible ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, dismissible: e.target.value === 'yes' }))}>
                  <option value="yes">Yes</option>
                  <option value="no">No (always visible)</option>
                </select>
              </div>
            </div>
            {msg && <p style={{ color: '#f87171', fontSize: 13 }}>{msg}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className={styles.btn} type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Announcement'}</button>
            </div>
          </form>
        </div>
      )}

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : items.length === 0
            ? <p className={styles.empty}>No announcements yet.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr><th>Title</th><th>Type</th><th>Audience</th><th>Active</th><th>Until</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {items.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: '#c0c0e0' }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: '#555570', marginTop: 2 }}>{a.message.substring(0, 60)}{a.message.length > 60 ? '…' : ''}</div>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${a.type === 'warning' ? styles.badgeYellow : a.type === 'error' ? styles.badgeRed : a.type === 'success' ? styles.badgeGreen : styles.badgeBlue}`}>
                          {a.type}
                        </span>
                      </td>
                      <td style={{ color: '#9999bb' }}>{a.audience}</td>
                      <td>
                        <span className={`${styles.badge} ${a.isActive ? styles.badgeGreen : styles.badgeGray}`}>
                          {a.isActive ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td style={{ color: '#555570', fontSize: 12 }}>
                        {a.showUntil ? new Date(a.showUntil).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {a.isActive
                            ? <button className={styles.btnGhost} onClick={() => doAction(a.id, 'deactivate')}>Deactivate</button>
                            : <button className={styles.btnGhost} onClick={() => doAction(a.id, 'activate')}>Activate</button>
                          }
                          <button className={styles.btnDanger} onClick={() => doAction(a.id, 'delete')}>Delete</button>
                        </div>
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
