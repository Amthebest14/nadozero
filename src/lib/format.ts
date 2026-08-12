export function usd(n: number, opts: { compact?: boolean; sign?: boolean } = {}) {
  const { compact = false, sign = false } = opts
  const abs = Math.abs(n)
  const prefix = sign && n > 0 ? '+' : n < 0 ? '-' : ''
  if (compact) {
    if (abs >= 1e9) return `${prefix}$${(abs / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${prefix}$${(abs / 1e6).toFixed(2)}M`
    if (abs >= 1e3) return `${prefix}$${(abs / 1e3).toFixed(1)}K`
  }
  return `${prefix}$${abs.toLocaleString(undefined, {
    minimumFractionDigits: abs < 100 ? 2 : 0,
    maximumFractionDigits: abs < 100 ? 2 : 0,
  })}`
}

export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`

export const pnlColor = (n: number) =>
  n > 0 ? 'text-[--color-up]' : n < 0 ? 'text-[--color-down]' : 'text-slate-500'
