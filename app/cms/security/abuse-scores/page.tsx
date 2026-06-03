'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AbuseUser {
  id: number
  email: string
  score: number
  status: string
  signals_count: number
  last_signal: string | null
  last_updated: string
}

interface AbuseSignal {
  id: number
  user_id: number
  ip_address: string
  signal_type: string
  severity: string
  details: Record<string, unknown>
  created_at: string
}

const THRESHOLDS = {
  WATCH: 30,
  RESTRICT: 60,
  SUSPEND_UPLOADS: 90,
  AUTO_SUSPEND: 120,
}

export default function AbuseScoresPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AbuseUser[]>([])
  const [signals, setSignals] = useState<AbuseSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [usersRes, signalsRes] = await Promise.all([
        fetch('/api/admin/security/abuse-scores'),
        fetch('/api/admin/security/abuse-signals'),
      ])
      if (!usersRes.ok || !signalsRes.ok) throw new Error('Load failed')
      const userData = await usersRes.json()
      const signalData = await signalsRes.json()
      setUsers(userData)
      setSignals(signalData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAdjustScore(userId: number) {
    if (!adjustAmount || !adjustReason) return
    setAdjusting(true)
    try {
      const res = await fetch('/api/admin/security/abuse-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          delta: parseInt(adjustAmount, 10),
          reason: adjustReason,
        }),
      })
      if (!res.ok) throw new Error('Adjust failed')
      setAdjustAmount('')
      setAdjustReason('')
      setSelectedUserId(null)
      await loadData()
    } catch (e) {
      console.error(e)
    } finally {
      setAdjusting(false)
    }
  }

  function getScoreColor(score: number) {
    if (score >= THRESHOLDS.AUTO_SUSPEND) return 'text-red-500'
    if (score >= THRESHOLDS.SUSPEND_UPLOADS) return 'text-orange-500'
    if (score >= THRESHOLDS.RESTRICT) return 'text-yellow-500'
    if (score >= THRESHOLDS.WATCH) return 'text-amber-500'
    return 'text-green-500'
  }

  function getStatusBadge(status: string, score: number) {
    if (status === 'suspended') return <span className="px-2 py-1 bg-red-900 text-red-200 rounded text-xs">Suspended</span>
    if (score >= THRESHOLDS.SUSPEND_UPLOADS) return <span className="px-2 py-1 bg-orange-900 text-orange-200 rounded text-xs">Uploads Blocked</span>
    if (score >= THRESHOLDS.RESTRICT) return <span className="px-2 py-1 bg-yellow-900 text-yellow-200 rounded text-xs">Restricted</span>
    if (score >= THRESHOLDS.WATCH) return <span className="px-2 py-1 bg-amber-900 text-amber-200 rounded text-xs">Watch</span>
    return <span className="px-2 py-1 bg-green-900 text-green-200 rounded text-xs">Clean</span>
  }

  if (loading) return <div className="p-8">Loading...</div>

  const highScoreUsers = users.filter(u => u.score >= THRESHOLDS.WATCH)

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Abuse Detection & Scoring</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-800 border border-slate-700 rounded p-4">
          <div className="text-sm text-slate-400">High Score Users</div>
          <div className="text-2xl font-bold">{highScoreUsers.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded p-4">
          <div className="text-sm text-slate-400">Recent Signals</div>
          <div className="text-2xl font-bold">{signals.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded p-4">
          <div className="text-sm text-slate-400">Uploads Blocked</div>
          <div className="text-2xl font-bold">{users.filter(u => u.score >= THRESHOLDS.SUSPEND_UPLOADS).length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded p-4">
          <div className="text-sm text-slate-400">Auto-Suspended</div>
          <div className="text-2xl font-bold">{users.filter(u => u.status === 'suspended').length}</div>
        </div>
      </div>

      {selectedUserId && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Adjust Score for {users.find(u => u.id === selectedUserId)?.email}</h2>
          <div className="grid grid-cols-3 gap-4">
            <input
              type="number"
              placeholder="Points (+ or -)"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <input
              type="text"
              placeholder="Reason"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleAdjustScore(selectedUserId)}
                disabled={adjusting || !adjustAmount || !adjustReason}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded text-white font-medium"
              >
                {adjusting ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setSelectedUserId(null)}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Users Flagged for Review ({highScoreUsers.length})</h2>
        <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-2">Email</th>
                <th className="text-right px-4 py-2">Score</th>
                <th className="text-center px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Signals</th>
                <th className="text-left px-4 py-2">Last Signal</th>
                <th className="text-left px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {highScoreUsers.sort((a, b) => b.score - a.score).map((user) => (
                <tr key={user.id} className="border-b border-slate-700 hover:bg-slate-700">
                  <td className="px-4 py-2 font-mono">{user.email}</td>
                  <td className={`px-4 py-2 text-right font-bold ${getScoreColor(user.score)}`}>
                    {user.score}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {getStatusBadge(user.status, user.score)}
                  </td>
                  <td className="px-4 py-2 text-right">{user.signals_count}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {user.last_signal ? new Date(user.last_signal).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setSelectedUserId(user.id)}
                      className="text-blue-400 hover:text-blue-300 text-sm mr-3"
                    >
                      Adjust
                    </button>
                    <a
                      href={`/cms/users/${user.id}`}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Profile
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Recent Abuse Signals (last 200)</h2>
        <div className="overflow-x-auto bg-slate-800 border border-slate-700 rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 border-b border-slate-700">
              <tr>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-center px-4 py-2">Severity</th>
                <th className="text-left px-4 py-2">IP</th>
                <th className="text-left px-4 py-2">Details</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {signals.slice(0, 200).map((signal) => {
                const user = users.find(u => u.id === signal.user_id)
                return (
                  <tr key={signal.id} className="border-b border-slate-700 hover:bg-slate-700">
                    <td className="px-4 py-2 font-mono">{user?.email || 'N/A'}</td>
                    <td className="px-4 py-2">{signal.signal_type}</td>
                    <td className={`px-4 py-2 text-center font-medium ${
                      signal.severity === 'critical' ? 'text-red-500' :
                      signal.severity === 'high' ? 'text-orange-500' :
                      signal.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                    }`}>
                      {signal.severity}
                    </td>
                    <td className="px-4 py-2 font-mono text-slate-400">{signal.ip_address}</td>
                    <td className="px-4 py-2 text-slate-300">
                      <details>
                        <summary className="cursor-pointer">Details</summary>
                        <pre className="mt-2 p-2 bg-slate-700 rounded text-xs overflow-auto max-w-xs">
                          {JSON.stringify(signal.details, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="px-4 py-2 text-slate-400">
                      {new Date(signal.created_at).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
