import type { TapeStats } from '../lib/nado'
import { usd } from '../lib/format'

const Spark = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
  </svg>
)

export function Hero({ tape, onExplore }: { tape: TapeStats | undefined; onExplore: () => void }) {
  const routedShare = tape && tape.totalVolume ? (tape.routedVolume / tape.totalVolume) * 100 : null

  const proof = [
    { value: tape ? usd(tape.totalVolume, { compact: true }) : '—', label: 'volume tracked' },
    { value: tape ? tape.uniqueTraders.toLocaleString() : '—', label: 'verified traders' },
    { value: routedShare !== null ? `${(100 - routedShare).toFixed(0)}%` : '—', label: 'market unclaimed' },
  ]

  return (
    <div className="rise-in mb-10">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-500/25 bg-mint-500/[0.08] px-3 py-1 text-xs font-medium text-mint-400">
        <Spark /> Zero effort. Zero experience. Just copy.
      </span>

      <h1 className="font-display mt-4 max-w-2xl text-4xl font-semibold leading-[1.15] tracking-tight text-slate-50 sm:text-5xl">
        Copy Nado's best traders,{' '}
        <span className="bg-gradient-to-r from-mint-300 to-mint-500 bg-clip-text text-transparent">
          verified on-chain.
        </span>
      </h1>

      <p className="mt-3 max-w-lg text-base leading-relaxed text-slate-500">
        Pick a leader ranked by real, on-chain performance — never self-reported. Link a wallet, set an
        amount, and their trades mirror into your own account automatically.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        <button
          onClick={onExplore}
          className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-sm font-semibold text-ink-950 shadow-[0_8px_30px_-8px_rgba(62,224,176,0.5)] transition-transform hover:-translate-y-0.5"
        >
          See who's winning →
        </button>

        <div className="flex items-center gap-5">
          {proof.map((p, i) => (
            <div key={p.label} className={i > 0 ? 'border-l border-ink-700/60 pl-5' : ''}>
              <div className="tnum font-display text-lg font-semibold leading-none text-slate-100">
                {p.value}
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
