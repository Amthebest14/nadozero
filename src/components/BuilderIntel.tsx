import type { TapeStats } from '../lib/nado'
import { rateToBps } from '../lib/nado'
import { pct, usd } from '../lib/format'
import { Panel, Pill, ProgressBar, Skeleton } from './ui'

export function BuilderIntel({ tape }: { tape: TapeStats | undefined }) {
  if (!tape) {
    return (
      <Panel title="Builder code intelligence">
        <Skeleton rows={6} />
      </Panel>
    )
  }

  const { builders, totalVolume, routedVolume, windowHours } = tape
  const scale = windowHours ? 24 / windowHours : null
  const routedShare = totalVolume ? (routedVolume / totalVolume) * 100 : 0
  const named = builders.filter((b) => b.builderId !== 0)
  const direct = builders.find((b) => b.builderId === 0)

  return (
    <Panel
      title="Builder code intelligence"
      desc="Every Nado fill carries an order appendix that encodes which builder routed it. Decoding the public tape shows exactly how much volume each builder captures — and how much of the market no builder has touched yet."
      right={
        scale && (
          <Pill>
            projections scaled from a <span className="tnum">{windowHours!.toFixed(1)}h</span> window
          </Pill>
        )
      }
    >
      {/* -------------------------------------------------- share bar */}
      <div className="border-b border-ink-700/50 px-6 py-5">
        <div className="mb-2.5 flex items-center justify-between text-xs">
          <span className="font-medium text-mint-400">{pct(routedShare)} routed by builders</span>
          <span className="text-slate-600">{pct(100 - routedShare)} still direct / unrouted</span>
        </div>
        <ProgressBar value={routedShare} className="h-2.5" />
      </div>

      <div className="grid gap-3.5 border-b border-ink-700/50 p-6 sm:grid-cols-3">
        <div className="rounded-xl border border-[--color-down]/25 bg-[--color-down]/[0.06] px-4 py-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Volume with no builder code
          </div>
          <div className="tnum font-display mt-1 text-3xl font-semibold text-[--color-down]">
            {pct(100 - routedShare)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {direct ? usd(direct.volume, { compact: true }) : '—'} traded direct through Nado's own UI
          </div>
        </div>
        <div className="rounded-xl border border-ink-700/60 bg-ink-850/50 px-4 py-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Routed by builders
          </div>
          <div className="tnum font-display mt-1 text-3xl font-semibold text-slate-100">{pct(routedShare)}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {named.length} builder{named.length === 1 ? '' : 's'} active in this window
          </div>
        </div>
        <div className="rounded-xl border border-mint-500/25 bg-mint-500/[0.07] px-4 py-3.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Top builder's share
          </div>
          <div className="tnum font-display mt-1 text-3xl font-semibold text-mint-300">
            {named.length ? pct((named[0].volume / totalVolume) * 100, 2) : '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">no single builder owns this market yet</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
              <th className="px-6 py-3 text-left font-semibold">Builder</th>
              <th className="px-3 py-3 text-right font-semibold">Volume routed</th>
              <th className="px-3 py-3 text-right font-semibold">Share</th>
              <th className="px-3 py-3 text-right font-semibold">Traders</th>
              <th className="px-3 py-3 text-right font-semibold">Fills</th>
              <th className="px-3 py-3 text-right font-semibold">Fee rates</th>
              <th className="px-3 py-3 text-right font-semibold">Fees earned</th>
              <th className="px-6 py-3 text-right font-semibold">Est. / month</th>
            </tr>
          </thead>
          <tbody>
            {named.map((b) => {
              const rates = [...b.feeRates].sort((x, y) => x - y).map(rateToBps)
              const monthly = scale ? b.earned * scale * 30 : null
              const share = (b.volume / totalVolume) * 100
              return (
                <tr key={b.builderId} className="border-b border-ink-800/50 transition-colors last:border-0 hover:bg-ink-850/50">
                  <td className="px-6 py-3">
                    <span className="tnum rounded-md border border-ink-700 bg-ink-850 px-2 py-0.5 text-slate-200">
                      #{b.builderId}
                    </span>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-slate-300">{usd(b.volume, { compact: true })}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="tnum text-slate-400">{pct(share, 2)}</span>
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-800">
                        <div
                          className="h-full rounded-full bg-mint-500/70"
                          style={{ width: `${Math.min(100, (share / (named[0].volume / totalVolume * 100)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-slate-400">{b.traders.size}</td>
                  <td className="tnum px-3 py-3 text-right text-slate-500">{b.fills}</td>
                  <td className="tnum px-3 py-3 text-right text-slate-500">
                    {rates.length ? `${rates.join(' / ')} bps` : '—'}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-slate-300">{b.earned > 0 ? usd(b.earned) : '—'}</td>
                  <td className="tnum px-6 py-3 text-right font-medium text-mint-400">
                    {monthly && monthly > 0 ? usd(monthly, { compact: true }) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="border-t border-ink-700/50 px-6 py-3.5 text-xs leading-relaxed text-slate-600">
        Monthly figures extrapolate this window's recorded builder fees to 30 days and assume
        activity holds steady — treat them as an order of magnitude, not a forecast. Fee rates are
        decoded per fill, so a builder appears with several rates when it prices markets differently.
      </p>
    </Panel>
  )
}
