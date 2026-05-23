'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

function buildTimeData() {
  const points = []
  for (let m = 0; m < 24 * 60; m += 30) {
    const h    = Math.floor(m / 60)
    const min  = m % 60
    const ampm = h < 12 ? 'am' : 'pm'
    const h12  = h % 12 === 0 ? 12 : h % 12
    points.push({
      time: `${h12}:${String(min).padStart(2, '0')}:00 ${ampm}`,
      accountSpend: 0,
      limit:        0,
      runningCores: 0,
    })
  }
  return points
}

const TIME_DATA = buildTimeData()

function Legend() {
  return (
    <div className="flex items-center justify-center gap-6 text-xs text-gray-400 mt-1 mb-2">
      <span><span className="cost-legend-rect cost-legend-rect--spend" />Account spend</span>
      <span><span className="cost-legend-rect cost-legend-rect--limit" />Limit</span>
      <span><span className="cost-legend-rect cost-legend-rect--cores" />Running Cores</span>
    </div>
  )
}

export default function CostLimitChart() {
  return (
    <div>
      <p className="text-center text-sm font-medium text-white mb-1">Select a limit to view usage</p>
      <Legend />
      <div className="cost-limit-chart-wrap">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={TIME_DATA} margin={{ top: 8, right: 55, left: 10, bottom: 24 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />

            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              interval={6}
              angle={-30}
              textAnchor="end"
              dy={8}
            />

            {/* Left Y — Cost */}
            <YAxis
              yAxisId="cost"
              orientation="left"
              domain={[0, 1.0]}
              ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Cost', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11, dx: -4 }}
            />

            {/* Right Y — Cores */}
            <YAxis
              yAxisId="cores"
              orientation="right"
              domain={[0, 1.0]}
              ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Cores', angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11, dx: 16 }}
            />

            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#d1d5db' }}
            />

            <Line yAxisId="cost"  dataKey="accountSpend" name="Account spend" stroke="#22d3ee" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="cost"  dataKey="limit"        name="Limit"         stroke="#ef4444" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="cores" dataKey="runningCores" name="Running Cores" stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
