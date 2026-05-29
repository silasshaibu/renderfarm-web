'use client'
import { useEffect, useState, FormEvent } from 'react'
import styles from '../../cms.module.css'

function otpauthUrl(secret: string, email: string, issuer = 'RenderfarmCMS') {
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?${params}`
}

interface Me { id: number; email: string }

export default function CmsProfilePage() {
  const [me, setMe]             = useState<Me | null>(null)
  const [pwd, setPwd]           = useState({ current: '', next: '', confirm: '' })
  const [pwdMsg, setPwdMsg]     = useState('')
  const [savingPwd, setSavingPwd] = useState(false)
  const [totpInfo, setTotpInfo] = useState<{ secret: string; codes: string[] } | null>(null)

  useEffect(() => {
    fetch('/api/cms/auth/me').then(r => r.json()).then(setMe)
  }, [])

  async function changePwd(e: FormEvent) {
    e.preventDefault()
    if (pwd.next !== pwd.confirm) { setPwdMsg('Passwords do not match.'); return }
    if (pwd.next.length < 12) { setPwdMsg('Password must be at least 12 characters.'); return }
    setSavingPwd(true); setPwdMsg('')
    const res = await fetch('/api/cms/superadmins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: String(me?.id), action: 'change_password', value: pwd.next }),
    })
    const d = await res.json()
    setSavingPwd(false)
    setPwdMsg(res.ok ? 'Password updated!' : d.message ?? 'Error')
    if (res.ok) setPwd({ current: '', next: '', confirm: '' })
  }

  async function resetMyTotp() {
    if (!confirm('This will reset your TOTP secret. You will need to reconfigure your authenticator app. Continue?')) return
    const res = await fetch('/api/cms/superadmins', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: String(me?.id), action: 'reset_totp' }),
    })
    const d = await res.json()
    if (res.ok && d.totpSecret) {
      setTotpInfo({ secret: d.totpSecret, codes: d.backupCodes ?? [] })
    }
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Profile</h1>
          <p className={styles.pageSubtitle}>{me?.email ?? '…'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Change Password */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e2e2f0', margin: '0 0 20px' }}>Change Password</h2>
          <form onSubmit={changePwd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="cms-pwd-new">New Password</label>
              <input id="cms-pwd-new" className={styles.formInput} type="password" minLength={12} required value={pwd.next} onChange={e => setPwd(p => ({ ...p, next: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="cms-pwd-confirm">Confirm New Password</label>
              <input id="cms-pwd-confirm" className={styles.formInput} type="password" minLength={12} required value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} />
            </div>
            {pwdMsg && <p style={{ fontSize: 13, color: pwdMsg.includes('updated') ? '#4ade80' : '#f87171' }}>{pwdMsg}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className={styles.btn} type="submit" disabled={savingPwd}>
                {savingPwd ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

        {/* TOTP */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#e2e2f0', margin: '0 0 12px' }}>Two-Factor Authentication</h2>
          <p style={{ fontSize: 13, color: '#7777aa', marginBottom: 20 }}>
            TOTP is mandatory for CMS access. Resetting will generate a new secret — you must immediately reconfigure your authenticator app.
          </p>
          <button type="button" className={styles.btnDanger} onClick={resetMyTotp}>Reset My TOTP Secret</button>
        </div>
      </div>

      {/* TOTP result modal */}
      {totpInfo && (
        <div className={styles.modalBackdrop} onClick={() => setTotpInfo(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>New TOTP Secret</h2>
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>
              Save these immediately. You will not see them again.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Secret (enter in Google Authenticator / Authy)</label>
              <code style={{ display: 'block', background: '#0d0d16', border: '1px solid #2a2a3e', borderRadius: 7, padding: '10px 14px', fontSize: 13, color: '#a5b4fc', letterSpacing: 2, wordBreak: 'break-all' }}>
                {totpInfo.secret}
              </code>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>otpauth:// URI (for manual import)</label>
              <code style={{ display: 'block', background: '#0d0d16', border: '1px solid #2a2a3e', borderRadius: 7, padding: '10px 14px', fontSize: 11, color: '#555570', wordBreak: 'break-all' }}>
                {me ? otpauthUrl(totpInfo.secret, me.email, 'RenderfarmCMS') : ''}
              </code>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Backup Codes</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {totpInfo.codes.map(c => (
                  <code key={c} style={{ background: '#0d0d16', border: '1px solid #2a2a3e', borderRadius: 5, padding: '6px 10px', fontSize: 12, color: '#9999bb' }}>{c}</code>
                ))}
              </div>
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btn} onClick={() => setTotpInfo(null)}>Done — I saved these</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
