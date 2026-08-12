import { useState } from 'react'
import { useLeaderboard, type LeaderRow } from '../lib/hooks'
import { defaultSubaccountOf, primarySubaccount, shortAddr, type TapeStats } from '../lib/nado'
import { pct, pnlColor, usd } from '../lib/format'
import { Avatar, Panel, Pill, RankBadge, Skeleton, Sparkline } from './ui'
import { ProfileModal } from './ProfileModal'
import { CopyModal } from './CopyModal'

type SortKey = 'pnlWeek' | 'pnlMonth' | 'pnlAll' | 'volume'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'pnlWeek', label: '7d PnL' },
  { key: 'pnlMonth', label: '30d PnL' },
  { key: 'pnlAll', label: 'All-time PnL' },
  { key: 'volume', label: 'Live volume' },
]

const sortValue = (r: LeaderRow, k: SortKey) =>
  k === 'volume' ? r.volume : (r.portfolio?.[k] ?? Number.NEGATIVE_INFINITY)

/** The subaccount to look up trade history for — from the tape when we've seen it, else a guess. */
const subaccountOf = (r: LeaderRow) => primarySubaccount(r) ?? defaultSubaccountOf(r.address)

function SpotlightCard({
  rank,
  row,
  onViewHistory,
  onCopy,
}: {
  rank: number
  row: LeaderRow
  onViewHistory: () => void
  onCopy: () => void
}) {
  const p = row.portfolio
  const glow = rank === 1 ? 'from-amber-400/15 via-ink-900 to-ink-900 border-amber-400/25' : 'from-ink-800/60 via-ink-900 to-ink-900 border-ink-700/60'
  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 ${glow}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar seed={row.address} size={38} />
          <div className="min-w-0">
            <a
              href={`https://explorer.inkonchain.com/address/${row.address}`}
              target="_blank" rel="noreferrer"
              className="tnum block whitespace-nowrap text-sm font-medium text-slate-200 hover:text-mint-400"
            >
              {shortAddr(row.address)}
            </a>
            <div className="whitespace-nowrap text-xs text-slate-500">
              {row.fills} fills · {p?.markets ?? 0} markets
            </div>
          </div>
        </div>
        <RankBadge rank={rank} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">30d PnL</div>
        <div className={`tnum font-display mt-0.5 text-2xl font-semibold ${p ? pnlColor(p.pnlMonth) : ''}`}>
          {p ? usd(p.pnlMonth, { compact: true, sign: true }) : '—'}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Sparkline data={p?.curve ?? []} width={110} height={30} />
        <div className="text-right">
          <div className="text-xs text-slate-600">account value</div>
          <div className="tnum text-sm text-slate-300">{p ? usd(p.accountValue, { compact: true }) : '—'}</div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <button
          onClick={onCopy}
          className="w-full rounded-lg border border-mint-500/30 bg-mint-500/[0.1] py-2 text-sm font-medium text-mint-400 transition-colors hover:bg-mint-500/[0.18]"
        >
          Copy this trader
        </button>
        <button
          onClick={onViewHistory}
          className="w-full rounded-lg border border-ink-600 bg-ink-800/60 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
        >
          View profile
        </button>
      </div>
    </div>
  )
}

export function Leaderboard({ tape }: { tape: TapeStats | undefined }) {
  const [sort, setSort] = useState<SortKey>('pnlMonth')
  const [selected, setSelected] = useState<LeaderRow | null>(null)
  const [copyTarget, setCopyTarget] = useState<LeaderRow | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { data, isPending } = useLeaderboard(tape)

  const rows = [...(data ?? [])].sort((a, b) => sortValue(b, sort) - sortValue(a, sort))
  const top3 = rows.slice(0, 3)
  const rest = rows.slice(3)

  if (isPending || !rows.length) {
    return (
      <Panel title="Trader leaderboard" desc="Verified from Nado's public archive — every number derived from on-chain fills and portfolio history.">
        <Skeleton rows={10} />
      </Panel>
    )
  }

  return (
    <div className="space-y-4">
      {sort !== 'volume' && (
        <div className="grid gap-3.5 sm:grid-cols-3">
          {top3.map((row, i) => (
            <SpotlightCard
              key={row.address}
              rank={i + 1}
              row={row}
              onViewHistory={() => setSelected(row)}
              onCopy={() => setCopyTarget(row)}
            />
          ))}
        </div>
      )}

      <Panel
        title="Full leaderboard"
        desc="Ranked among the most active traders in the live window. Click a row to see their recent trade history. Nothing here is self-reported."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700/60 bg-ink-850/80 p-1">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    sort === s.key ? 'bg-mint-500/20 text-mint-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="rounded-lg border border-ink-700/60 bg-ink-850/80 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
            >
              {showAdvanced ? 'Fewer columns' : 'More columns'}
            </button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
                <th className="w-12 px-6 py-3 text-left font-semibold">Rank</th>
                <th className="px-3 py-3 text-left font-semibold">Trader</th>
                <th className="px-3 py-3 text-right font-semibold">Account value</th>
                <th className="px-3 py-3 text-right font-semibold">7d PnL</th>
                <th className="px-3 py-3 text-right font-semibold">30d PnL</th>
                <th
                  className="cursor-help px-3 py-3 text-right font-semibold decoration-dotted underline-offset-4 hover:underline"
                  title="Realized + unrealized profit and loss since this wallet's first trade on Nado."
                >
                  All-time
                </th>
                {showAdvanced && (
                  <th
                    className="cursor-help px-3 py-3 text-center font-semibold decoration-dotted underline-offset-4 hover:underline"
                    title="Account value over the last 7 days — shape of the trend, not the exact numbers."
                  >
                    7d equity
                  </th>
                )}
                <th
                  className="cursor-help px-3 py-3 text-right font-semibold decoration-dotted underline-offset-4 hover:underline"
                  title="Volume from this trader in the current scan window (the last fraction of an hour) — not their lifetime volume."
                >
                  Live vol
                </th>
                {showAdvanced && (
                  <th
                    className="cursor-help px-3 py-3 text-right font-semibold decoration-dotted underline-offset-4 hover:underline"
                    title="Share of their fills that crossed the spread and paid the taker fee, instead of resting an order and waiting to get filled. Higher usually means faster, more aggressive entries."
                  >
                    Taker
                  </th>
                )}
                <th className="px-6 py-3 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {(sort === 'volume' ? rows : rest).map((r, i) => {
                const p = r.portfolio
                const rank = sort === 'volume' ? i + 1 : i + 4
                return (
                  <tr
                    key={r.address}
                    onClick={() => setSelected(r)}
                    style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }}
                    className="rise-in group cursor-pointer border-b border-ink-800/50 transition-colors last:border-0 hover:bg-ink-850/50"
                  >
                    <td className="px-6 py-3">
                      <RankBadge rank={rank} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar seed={r.address} size={26} />
                        <div>
                          <a
                            href={`https://explorer.inkonchain.com/address/${r.address}`}
                            target="_blank" rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="tnum whitespace-nowrap text-slate-200 transition-colors hover:text-mint-400"
                          >
                            {shortAddr(r.address)}
                          </a>
                          <div className="whitespace-nowrap text-xs text-slate-600">
                            {r.fills} fills{p?.markets ? ` · ${p.markets} markets` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-slate-300">
                      {p ? usd(p.accountValue, { compact: true }) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {p ? <Pill tone={p.pnlWeek > 0 ? 'up' : p.pnlWeek < 0 ? 'down' : 'default'}>{usd(p.pnlWeek, { compact: true, sign: true })}</Pill> : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {p ? <Pill tone={p.pnlMonth > 0 ? 'up' : p.pnlMonth < 0 ? 'down' : 'default'}>{usd(p.pnlMonth, { compact: true, sign: true })}</Pill> : '—'}
                    </td>
                    <td className={`tnum px-3 py-3 text-right ${p ? pnlColor(p.pnlAll) : ''}`}>
                      {p ? usd(p.pnlAll, { compact: true, sign: true }) : '—'}
                    </td>
                    {showAdvanced && (
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <Sparkline data={p?.curve ?? []} />
                        </div>
                      </td>
                    )}
                    <td className="tnum px-3 py-3 text-right text-slate-400">{usd(r.volume, { compact: true })}</td>
                    {showAdvanced && (
                      <td className="tnum px-3 py-3 text-right text-slate-500">{pct((r.takerFills / r.fills) * 100, 0)}</td>
                    )}
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCopyTarget(r)
                        }}
                        className="rounded-md border border-mint-500/30 bg-mint-500/[0.08] px-2.5 py-1 text-xs font-medium text-mint-400 opacity-0 transition-opacity hover:bg-mint-500/[0.16] group-hover:opacity-100"
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {selected && (
        <ProfileModal
          address={selected.address}
          subaccount={subaccountOf(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      {copyTarget && <CopyModal leader={copyTarget} onClose={() => setCopyTarget(null)} />}
    </div>
  )
}
