interface ProgressBarProps {
  value: number // 0–100
}

export default function ProgressBar({ value }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      {/* Track — height + bg via .progress-track CSS class */}
      <div className="progress-track">
        {/* Fill — width driven by --pw CSS custom property */}
        <div
          className="progress-fill"
          style={{ '--pw': `${clamped}%` } as React.CSSProperties}
        />
      </div>
      {/* Percentage label */}
      <span className="text-xs text-gray-400 w-8 text-right tabular-nums">
        {clamped}%
      </span>
    </div>
  )
}
