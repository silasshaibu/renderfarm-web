'use client'
import { useEffect, useState } from 'react'
import styles from '../../cms.module.css'

interface Flag { key: string; value: boolean; description: string; lastChangedAt: string | null }

const FLAG_WARNINGS: Record<string, string> = {
  maintenance_mode:           'Enables maintenance mode — all job submissions will be blocked for all users.',
  new_registrations_enabled:  'Disabling this will prevent new users from registering.',
  job_submission_enabled:     'Disabling this blocks all job submissions platform-wide.',
  mfa_required_for_all:       'Enabling forces all users to set up TOTP on next login.',
  credit_blocking_enabled:    'Disabling allows users to submit jobs even with zero or negative credits.',
}

export default function CmsConfigPage() {
  const [flags, setFlags]   = useState<Flag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/cms/config').then(r => r.json()).then(setFlags).finally(() => setLoading(false))
  }, [])

  async function toggle(flag: Flag) {
    const warning = FLAG_WARNINGS[flag.key]
    if (warning && !flag.value) {
      if (!confirm(warning + '\n\nAre you sure?')) return
    }
    setSaving(flag.key)
    const res = await fetch('/api/cms/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: flag.key, value: !flag.value }),
    })
    if (res.ok) {
      setFlags(fs => fs.map(f => f.key === flag.key ? { ...f, value: !f.value } : f))
    }
    setSaving(null)
  }

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Platform Config</h1>
          <p className={styles.pageSubtitle}>Feature flags — changes take effect immediately</p>
        </div>
      </div>

      <div className={styles.card}>
        {loading
          ? <p className={styles.empty}>Loading…</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {flags.map((flag, i) => (
                <div key={flag.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 0',
                  borderBottom: i < flags.length - 1 ? '1px solid #151524' : 'none',
                  gap: 20,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: '#c0c0e0', fontWeight: 500, marginBottom: 3 }}>
                      {flag.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </div>
                    <div style={{ fontSize: 12, color: '#555570' }}>{flag.description}</div>
                    {flag.lastChangedAt && (
                      <div style={{ fontSize: 11, color: '#3a3a50', marginTop: 3 }}>
                        Last changed {new Date(flag.lastChangedAt).toLocaleString()}
                      </div>
                    )}
                    {FLAG_WARNINGS[flag.key] && !flag.value && (
                      <div style={{ fontSize: 11, color: '#facc15', marginTop: 4 }}>
                        ⚠ {FLAG_WARNINGS[flag.key]}
                      </div>
                    )}
                  </div>
                  <label className={styles.toggle} aria-label={`Toggle ${flag.key}`}>
                    <input
                      type="checkbox"
                      checked={flag.value}
                      onChange={() => toggle(flag)}
                      disabled={saving === flag.key}
                    />
                    <span className={styles.toggleSlider} />
                  </label>
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  )
}
