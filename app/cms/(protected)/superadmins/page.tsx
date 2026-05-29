'use client'
import { useEffect, useState, FormEvent } from 'react'
import styles from '../../cms.module.css'

interface SuperAdmin {
  id: string; email: string; isActive: boolean; hasTotp: boolean
  lastLoginAt: string | null; lastLoginIp: string; createdAt: string
}

export default function CmsSuperAdminsPage() {
  const [admins, setAdmins]   = useState<SuperAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addPwd, setAddPwd]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')
  const [totpResult, setTotpResult] = useState<{ email: string; secret: string; codes: string[] } | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/cms/superadmins').then(r => r.json()).then(setAdmins).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg('')
    const res = await fetch('/api/cms/superadmins', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail, password: addPwd }),
    })
    const d = await res.json()
    setSaving(false)
    if (!res.ok) { setMsg(d.message ?? 'Error'); return }
    setMsg('Created! They must set up TOTP before they can log in.')
    setAddEmail(''); setAddPwd('')
    load()
  }

  async function resetTotp(id: string, email: string) {
    if (!confirm('Reset TOTP for ' + email + '?')) return
    const res = await fetch('/api/cms/superadmins', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'reset_totp' }),
    })
    const d = await res.json()
    if (res.ok && d.totpSecret) {
      setTotpResult({ email, secret: d.totpSecret, codes: d.backupCodes ?? [] })
    }
    load()
  }

  async function deactivate(id: string, email: string) {
    if (!confirm('Deactivate ' + email + '?')) return
    await fetch('/api/cms/superadmins', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'deactivate' }),
    })
    load()
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Super Admins</h1>
          <p className={styles.pageSubtitle}>Manage CMS access accounts</p>
        </div>
        <button className={styles.btn} onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Cancel' : '+ Add Super Admin'}
        </button>
      </div>

      {showAdd && (
        <div className={styles.card} style={{ marginBottom: 20 }}>
          <form onSubmit={add} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className={styles.formGroup} style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <label className={styles.formLabel}>Email</label>
              <input className={styles.formInput} type="email" required value={addEmail} onChange={e => setAddEmail(e.target.value)} />
            </div>
            <div className={styles.formGroup} style={{ margin: 0, flex: 1, minWidth: 200 }}>
              <label className={styles.formLabel}>Password (min 12 chars)</label>
              <input className={styles.formInput} type="password" minLength={12} required value={addPwd} onChange={e => setAddPwd(e.target.value)} />
            </div>
            <button className={styles.btn} type="submit" disabled={saving} style={{ flexShrink: 0 }}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </form>
          {msg && <p style={{ fontSize: 13, color: '#4ade80', marginTop: 12 }}>{msg}</p>}
        </div>
      )}

      <div className={`${styles.card} ${styles.tableWrap}`}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : (
            <table className={styles.table}>
              <thead>
                <tr><th>Email</th><th>Status</th><th>TOTP</th><th>Last Login</th><th>IP</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.email}</td>
                    <td>
                      <span className={`${styles.badge} ${a.isActive ? styles.badgeGreen : styles.badgeRed}`}>
                        {a.isActive ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${a.hasTotp ? styles.badgeGreen : styles.badgeYellow}`}>
                        {a.hasTotp ? 'configured' : 'not set'}
                      </span>
                    </td>
                    <td style={{ color: '#555570', fontSize: 12 }}>
                      {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td style={{ color: '#555570', fontSize: 12 }}>{a.lastLoginIp || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className={styles.btnGhost} onClick={() => resetTotp(a.id, a.email)}>Reset TOTP</button>
                        <button className={styles.btnDanger} onClick={() => deactivate(a.id, a.email)}>Deactivate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </div>

      {/* TOTP result modal */}
      {totpResult && (
        <div className={styles.modalBackdrop} onClick={() => setTotpResult(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>TOTP Reset — {totpResult.email}</h2>
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>
              Save these now — they will not be shown again.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>TOTP Secret (enter in authenticator app)</label>
              <code style={{ display: 'block', background: '#0d0d16', border: '1px solid #2a2a3e', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: '#a5b4fc', letterSpacing: 2 }}>
                {totpResult.secret}
              </code>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Backup Codes</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {totpResult.codes.map(c => (
                  <code key={c} style={{ background: '#0d0d16', border: '1px solid #2a2a3e', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#9999bb' }}>{c}</code>
                ))}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.btn} onClick={() => setTotpResult(null)}>Done — I saved these</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
