import type { ReactNode } from 'react'

/** Tiny inline SVG equity curve — no chart library needed at this size. */
export function Sparkline({
  data,
  width = 104,
  height = 32,
}: {
  data: number[]
  width?: number
  height?: number
}) {
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className="grid place-items-center text-xs text-slate-700">no data</div>
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const step = width / (data.length - 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
  const up = data[data.length - 1] >= data[0]
  const stroke = up ? 'var(--color-up)' : 'var(--color-down)'
  const id = `sg-${up ? 'u' : 'd'}-${width}`

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.75"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Deterministic gradient "identicon" so addresses feel like people, not hex strings. */
export function Avatar({ seed, size = 34 }: { seed: string; size?: number }) {
  let h1 = 0, h2 = 0
  for (let i = 0; i < seed.length; i++) {
    h1 = (h1 * 31 + seed.charCodeAt(i)) >>> 0
    h2 = (h2 * 17 + seed.charCodeAt(i)) >>> 0
  }
  const hueA = h1 % 360
  const hueB = (h2 % 360)
  const id = `av-${seed.slice(2, 10)}`
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0 rounded-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hueA} 75% 58%)`} />
          <stop offset="100%" stopColor={`hsl(${hueB} 70% 45%)`} />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="20" fill={`url(#${id})`} />
      <rect width="40" height="40" rx="20" fill="black" fillOpacity="0.08" />
    </svg>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

export function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <span className="text-base leading-none">{MEDALS[rank - 1]}</span>
  }
  return <span className="tnum text-sm text-slate-600">{rank}</span>
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: boolean
  icon?: ReactNode
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border px-5 py-4 transition-transform duration-200 hover:-translate-y-0.5 ${
        accent
          ? 'border-mint-500/30 bg-gradient-to-br from-mint-500/[0.1] via-ink-900 to-ink-900 card-glow'
          : 'border-ink-700/60 bg-ink-900/60 glass'
      }`}
    >
      {accent && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-mint-400/20 blur-2xl" />
      )}
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <div className={accent ? 'text-mint-400' : 'text-slate-600'}>{icon}</div>}
      </div>
      <div className={`tnum font-display mt-2 text-3xl font-semibold leading-none ${accent ? 'text-mint-300' : 'text-slate-50'}`}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export function Panel({
  title,
  desc,
  right,
  children,
}: {
  title: string
  desc?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-900/50 glass">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-700/50 px-6 py-5">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-slate-50">{title}</h2>
          {desc && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{desc}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-ink-800 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-mint-600 via-mint-500 to-mint-300 transition-all duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'up' | 'down' }) {
  const tones = {
    default: 'border-ink-600 bg-ink-800/80 text-slate-400',
    up: 'border-[--color-up]/30 bg-[--color-up]/10 text-[--color-up]',
    down: 'border-[--color-down]/30 bg-[--color-down]/10 text-[--color-down]',
  }
  return (
    <span className={`tnum inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="shimmer h-12 rounded-lg" style={{ opacity: 1 - i * 0.055 }} />
      ))}
    </div>
  )
}
