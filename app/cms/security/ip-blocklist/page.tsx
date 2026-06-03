'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface BlockedIP {
  id: number
  ip_address: string
  reason: string
  blocked_at: string
  blocked_by: string
  expires_at: string | null
  is_active: boolean
}

interface BlockedAttempt {
  id: number
  ip_address: string
  attempted_at: string
  endpoint: string
  user_agent: string
}

export default function IPBlocklistPage() {
  const router = useRouter()
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([])
  const [blockedAttempts, setBlockedAttempts] = useState<BlockedAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [blockForm, setBlockForm] = useState({ ip: '', reason: '', expiresHours: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [ipsRes, attemptsRes] = await Promise.all([
        fetch('/api/admin/security/ip-blocklist'),
        fetch('/api/admin/security/blocked-attempts'),
      ])
      if (!ipsRes.ok || !attemptsRes.ok) throw new Error('Load failed')
      const ips = await ipsRes.json()
      const attempts = await attemptsRes.json()
      setBlockedIPs(ips)
      setBlockedAttempts(attempts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleBlock() {
    if (!blockForm.ip || !blockForm.reason) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/security/ip-blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: blockForm.ip,
          reason: blockForm.reason,
          expiresHours: blockForm.expiresHours ? parseInt(blockForm.expiresHours) : null,
        }),
      })
      if (!res.ok) throw new Error('Block failed')
      setBlockForm({ ip: '', reason: '', expiresHours: '' })
      await loadData()
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUnblock(id: number) {
    if (!confirm('Unblock this IP?')) return
    try {
      const res = await fetch(`/api/admin/security/ip-blocklist/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Unblock failed')
      await loadData()
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">IP Blocklist</h1>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Block an IP</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="IP address"
            value={blockForm.ip}
            onChange={(e) => setBlockForm({ ...blockForm, ip: e.target.value })}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
          <input
            type="text"
            placeholder="Reason"
            value={blockForm.reason}
            onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
          <input
            type="number"
            placeholder="Expires in hours (empty = permanent)"
            value={blockForm.expiresHours}
            onChange={(e) => setBlockForm({ ...blockForm, expiresHours: e.target.value })}
            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
          />
          <button
            onClick={handleBlock}
            disabled={submitting || !blockForm.ip || !blockForm.reason}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 rounded text-white font-medium"
          >
            {submitting ? 'Blocking...' : 'Block'}
          </button>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Active Blocks ({blockedIPs.filter(ip => ip.is_active).length})</h2>
        <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-2">IP Address</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Blocked</th>
                <th className="text-left px-4 py-2">Expires</th>
                <th className="text-left px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {blockedIPs.filter(ip => ip.is_active).map((ip) => (
                <tr key={ip.id} className="border-b border-slate-700 hover:bg-slate-700">
                  <td className="px-4 py-2 font-mono">{ip.ip_address}</td>
                  <td className="px-4 py-2">{ip.reason}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {new Date(ip.blocked_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {ip.expires_at ? (
                      <span className="text-amber-400">
                        {new Date(ip.expires_at).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-red-400">Permanent</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleUnblock(ip.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Unblock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Recent Blocked Attempts (last 100)</h2>
        <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-2">IP</th>
                <th className="text-left px-4 py-2">Endpoint</th>
                <th className="text-left px-4 py-2">User Agent</th>
                <th className="text-left px-4 py-2">Attempted</th>
              </tr>
            </thead>
            <tbody>
              {blockedAttempts.slice(0, 100).map((attempt) => (
                <tr key={attempt.id} className="border-b border-slate-700 hover:bg-slate-700">
                  <td className="px-4 py-2 font-mono">{attempt.ip_address}</td>
                  <td className="px-4 py-2">{attempt.endpoint}</td>
                  <td className="px-4 py-2 text-slate-400 truncate max-w-xs">{attempt.user_agent}</td>
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(attempt.attempted_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
