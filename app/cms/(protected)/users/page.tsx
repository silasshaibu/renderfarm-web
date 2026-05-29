'use client'
import { useEffect, useState, useCallback, FormEvent } from 'react'
import styles from '../../cms.module.css'

interface User {
  id: string; email: string; name: string
  isAdmin: boolean; isActive: boolean; status: string
  suspensionReason: string; createdAt: string
  lastLoginAt: string | null; invited: boolean
  totpEnabled: boolean; creditLimit: number; balance: number
}

const LIMIT = 50

export default function CmsUsersPage() {
  const [users, setUsers]     = useState<User[]>([])
  const [total, setTotal]     = useState(0)
  const [q, setQ]             = useState('')
  const [statusF, setStatusF] = useState('')
  const [offset, setOffset]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<{ user: User; action: string } | null>(null)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ q, status: statusF, limit: String(LIMIT), offset: String(offset) })
    const res = await fetch(`/api/cms/users?${params}`)
    const data = await res.json()
    setUsers(data.users ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }, [q, statusF, offset])

  useEffect(() => { load() }, [load])

  async function doAction(user: User, action: string, value?: unknown) {
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/cms/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, action, value }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg(data.message ?? 'Error'); return }
    setMsg('Done.')
    setModal(null)
    load()
  }

  function openModal(user: User, action: string) {
    setModal({ user, action })
    setInputVal('')
    setMsg('')
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Users</h1>
          <p className={styles.pageSubtitle}>{total} total</p>
        </div>
      </div>

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search email or name…"
          value={q}
          onChange={e => { setQ(e.target.value); setOffset(0) }}
        />
        <select className={styles.select} value={statusF} onChange={e => { setStatusF(e.target.value); setOffset(0) }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : users.length === 0
            ? <p className={styles.empty}>No users found.</p>
            : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Balance</th>
                    <th>Admin</th>
                    <th>2FA</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>{u.email}</td>
                      <td style={{ color: '#9999bb' }}>{u.name || '—'}</td>
                      <td>
                        <span className={`${styles.badge} ${u.status === 'suspended' ? styles.badgeRed : u.invited ? styles.badgeYellow : styles.badgeGreen}`}>
                          {u.invited ? 'pending' : u.status}
                        </span>
                      </td>
                      <td style={{ color: u.balance < 0 ? '#f87171' : '#c0c0e0' }}>
                        ${u.balance.toFixed(2)}
                        {u.creditLimit > 0 && <span style={{ color: '#555570', fontSize: 11 }}> / ${u.creditLimit}</span>}
                      </td>
                      <td>{u.isAdmin ? <span className={`${styles.badge} ${styles.badgePurple}`}>admin</span> : '—'}</td>
                      <td>{u.totpEnabled ? <span className={`${styles.badge} ${styles.badgeGreen}`}>on</span> : <span className={`${styles.badge} ${styles.badgeGray}`}>off</span>}</td>
                      <td style={{ color: '#555570', whiteSpace: 'nowrap' }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {u.status === 'suspended'
                            ? <button className={styles.btnGhost} onClick={() => doAction(u, 'unsuspend')}>Unsuspend</button>
                            : <button className={styles.btnDanger} onClick={() => openModal(u, 'suspend')}>Suspend</button>
                          }
                          <button className={styles.btnGhost} onClick={() => openModal(u, 'grant')}>Credits</button>
                          <button className={styles.btnGhost} onClick={() => openModal(u, 'limit')}>Limit</button>
                          {u.totpEnabled && <button className={styles.btnGhost} onClick={() => doAction(u, 'reset_2fa')}>Reset 2FA</button>}
                          {u.isAdmin
                            ? <button className={styles.btnDanger} onClick={() => doAction(u, 'remove_admin')}>Demote</button>
                            : <button className={styles.btnGhost} onClick={() => doAction(u, 'make_admin')}>Promote</button>
                          }
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

      {/* Modal */}
      {modal && (
        <div className={styles.modalBackdrop} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>
              {modal.action === 'suspend' && 'Suspend User'}
              {modal.action === 'grant'   && 'Grant Credits'}
              {modal.action === 'limit'   && 'Set Balance Limit'}
            </h2>
            <p style={{ fontSize: 13, color: '#9999bb', margin: '0 0 16px' }}>{modal.user.email}</p>

            {modal.action === 'suspend' && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Reason (shown to user)</label>
                  <input className={styles.formInput} value={inputVal} onChange={e => setInputVal(e.target.value)} placeholder="Optional" />
                </div>
                {msg && <p style={{ color: '#f87171', fontSize: 13 }}>{msg}</p>}
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
                  <button className={styles.btnDanger} disabled={saving} onClick={() => doAction(modal.user, 'suspend', inputVal)}>
                    {saving ? 'Saving…' : 'Suspend'}
                  </button>
                </div>
              </>
            )}

            {modal.action === 'grant' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[5, 10, 25, 50, 100, 200].map(p => (
                    <button key={p} className={styles.btnGhost} onClick={() => setInputVal(String(p))}>${p}</button>
                  ))}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Amount ($)</label>
                  <input className={styles.formInput} type="number" min="0.01" step="0.01" value={inputVal} onChange={e => setInputVal(e.target.value)} />
                </div>
                {msg && <p style={{ color: msg === 'Done.' ? '#4ade80' : '#f87171', fontSize: 13 }}>{msg}</p>}
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
                  <button className={styles.btn} disabled={saving || !inputVal} onClick={() => doAction(modal.user, 'grant_credits', { amount: Number(inputVal), note: 'CMS credit grant' })}>
                    {saving ? 'Saving…' : 'Grant'}
                  </button>
                </div>
              </>
            )}

            {modal.action === 'limit' && (
              <>
                <p style={{ fontSize: 12, color: '#555570', marginBottom: 12 }}>
                  Current limit: ${modal.user.creditLimit}. Set to 0 to block at zero balance.
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[0, 50, 100, 200, 500, 1000].map(p => (
                    <button key={p} className={styles.btnGhost} onClick={() => setInputVal(String(p))}>${p}</button>
                  ))}
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Limit ($)</label>
                  <input className={styles.formInput} type="number" min="0" step="0.01" value={inputVal} onChange={e => setInputVal(e.target.value)} />
                </div>
                {msg && <p style={{ color: msg === 'Done.' ? '#4ade80' : '#f87171', fontSize: 13 }}>{msg}</p>}
                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setModal(null)}>Cancel</button>
                  <button className={styles.btn} disabled={saving || inputVal === ''} onClick={() => doAction(modal.user, 'set_credit_limit', Number(inputVal))}>
                    {saving ? 'Saving…' : 'Set Limit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
