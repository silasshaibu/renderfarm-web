'use client'
import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import styles from '../cms.module.css'

interface DashData {
  users:       { total: number; active: number; suspended: number; newToday: number; newWeek: number; newMonth: number }
  jobs:        { total: number; running: number; completed: number; failed: number; last24h: number; last7d: number }
  credits:     { totalGranted: number; totalConsumed: number; outstanding: number }
  sessions:    { active: number }
  recentJobs:  { jobNumber: number; title: string; status: string; createdAt: string; userEmail: string }[]
  recentUsers: { id: string; email: string; name: string; createdAt: string; status: string }[]
  dailyJobs:   { day: string; count: number; completed: number; failed: number }[]
}

const STATUS_CLASS: Record<string, string> = {
  success:  styles.badgeGreen,
  running:  styles.badgeBlue,
  syncing:  styles.badgeBlue,
  failed:   styles.badgeRed,
  cancelled:styles.badgeGray,
  queued:   styles.badgeYellow,
}

export default function CmsDashboard() {
  const [data, setData]     = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cms/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: '#555570', padding: '40px' }}>Loading…</p>
  if (!data)   return <p style={{ color: '#f87171', padding: '40px' }}>Failed to load dashboard.</p>

  const chartData = data.dailyJobs.map(d => ({
    day:       new Date(d.day).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    Total:     d.count,
    Completed: d.completed,
    Failed:    d.failed,
  }))

  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dashboard</h1>
          <p className={styles.pageSubtitle}>Platform overview — super admin view</p>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statGrid}>
        <StatCard label="Total Users"    value={data.users.total}        sub={`+${data.users.newToday} today`} />
        <StatCard label="Active Users"   value={data.users.active}       sub={`${data.users.suspended} suspended`} />
        <StatCard label="New This Month" value={data.users.newMonth}     sub={`${data.users.newWeek} this week`} />
        <StatCard label="Jobs Total"     value={data.jobs.total}         sub={`${data.jobs.last24h} last 24h`} />
        <StatCard label="Running Jobs"   value={data.jobs.running}       sub="" color="#60a5fa" />
        <StatCard label="Failed Jobs"    value={data.jobs.failed}        sub={`${data.jobs.last7d} last 7d total`} color={data.jobs.failed > 0 ? '#f87171' : undefined} />
        <StatCard label="Credits Issued" value={`$${data.credits.totalGranted.toFixed(2)}`} sub="" />
        <StatCard label="Outstanding"    value={`$${data.credits.outstanding.toFixed(2)}`}  sub="" />
        <StatCard label="Active Sessions"value={data.sessions.active}    sub="" />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className={`${styles.card} ${styles.chartCard}`} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#9999bb', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Jobs — Last 14 Days</h2>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#555570', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#555570', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#12121e', border: '1px solid #1e1e30', borderRadius: 8 }}
                labelStyle={{ color: '#9999bb', fontSize: 12 }}
                itemStyle={{ color: '#c0c0e0', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="Total"     stroke="#6366f1" fill="url(#colTotal)"     strokeWidth={2} />
              <Area type="monotone" dataKey="Completed" stroke="#4ade80" fill="url(#colCompleted)" strokeWidth={2} />
              <Area type="monotone" dataKey="Failed"    stroke="#f87171" fill="none"               strokeWidth={1.5} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent Jobs */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#9999bb', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Jobs</h2>
          {data.recentJobs.length === 0
            ? <p className={styles.empty} style={{ padding: 20 }}>No jobs yet.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.recentJobs.map(j => (
                  <div key={j.jobNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, color: '#c0c0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        #{j.jobNumber} {j.title}
                      </div>
                      <div style={{ fontSize: 11, color: '#555570' }}>{j.userEmail}</div>
                    </div>
                    <span className={`${styles.badge} ${STATUS_CLASS[j.status] ?? styles.badgeGray}`}>{j.status}</span>
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Recent Users */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#9999bb', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Users</h2>
          {data.recentUsers.length === 0
            ? <p className={styles.empty} style={{ padding: 20 }}>No users yet.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.recentUsers.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, color: '#c0c0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </div>
                      <div style={{ fontSize: 11, color: '#555570' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className={`${styles.badge} ${u.status === 'suspended' ? styles.badgeRed : styles.badgeGreen}`}>
                      {u.status ?? 'active'}
                    </span>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color?: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue} style={color ? { color } : undefined}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  )
}
