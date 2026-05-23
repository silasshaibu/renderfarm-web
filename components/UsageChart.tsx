'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

// ---------------------------------------------------------------------------
// Time-series data — one point every 30 min for the full day
// ---------------------------------------------------------------------------
function buildTimeData() {
  const points = []
  for (let m = 0; m < 24 * 60; m += 30) {
    const h   = Math.floor(m / 60)
    const min = m % 60
    const ampm = h < 12 ? 'am' : 'pm'
    const h12  = h % 12 === 0 ? 12 : h % 12
    points.push({
      time: `${h12}:${String(min).padStart(2, '0')}:00 ${ampm}`,
      accountSpend: 0,
      coreHours:    0,
      storageSpend: 0,
    })
  }
  return points
}

const TIME_DATA = buildTimeData()

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
function CustomLegend() {
  return (
    <div className="flex items-center justify-center gap-6 text-xs text-gray-400 mt-1">
      <span><span className="usage-legend-rect usage-legend-rect--account" />Account spend</span>
      <span><span className="usage-legend-rect usage-legend-rect--cores" />Core Hours</span>
      <span><span className="usage-legend-rect usage-legend-rect--storage" />Storage Spend</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
export default function UsageChart({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white text-center mb-1">{title}</h3>
      <CustomLegend />
      <div className="usage-line-chart-wrap">
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={TIME_DATA} margin={{ top: 8, right: 60, left: 10, bottom: 24 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" vertical={false} />

            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 11 }}
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
              domain={[0, 0.9]}
              ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Cost', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 11, dx: -4 }}
            />

            {/* Right Y — Core Hours */}
            <YAxis
              yAxisId="cores"
              orientation="right"
              domain={[0, 1.0]}
              ticks={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Core Hours', angle: 90, position: 'insideRight', fill: '#6b7280', fontSize: 11, dx: 16 }}
            />

            <Tooltip
              contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#d1d5db' }}
            />

            <Line yAxisId="cost"  dataKey="accountSpend" name="Account spend" stroke="#22d3ee" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="cores" dataKey="coreHours"    name="Core Hours"    stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="cost"  dataKey="storageSpend" name="Storage Spend" stroke="#a855f7" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
