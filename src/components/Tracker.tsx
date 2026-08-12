import { useEffect, useRef, useState } from 'react'
import { useIdxCalibration, useSymbols, useWhaleTape, type LeaderRow } from '../lib/hooks'
import {
  addressOf,
  estimateTimestamp,
  fromX18,
  productIdOfMatch,
  shortAddr,
  timeAgo,
  type Match,
} from '../lib/nado'
import { usd } from '../lib/format'
import { Avatar, Panel, Pill, Skeleton } from './ui'
import { ProfileModal } from './ProfileModal'
import { CopyModal } from './CopyModal'

const THRESHOLDS = [1_000, 5_000, 10_000, 50_000]

/**
 * One whale *order*, not one fill. A single big order sweeping the book lands
 * on the tape as many small fills sharing one digest — filtering per-fill
 * would miss exactly the trades this feed exists to catch, so fills are
 * grouped by digest and the group's summed notional is what gets thresholded.
 */
interface WhaleOrder {
  digest: string
  address: string
  senderSubaccount: string
  isolated: boolean
  productId: number
  isBuy: boolean
  qty: number
  notional: number
  fillCount: number
  isTaker: boolean
  newestIdx: string
}

function groupIntoOrders(matches: Match[]): WhaleOrder[] {
  const orders = new Map<string, WhaleOrder>()
  for (const m of matches) {
    const base = fromX18(m.base_filled)
    const quote = Math.abs(fromX18(m.quote_filled))
    let o = orders.get(m.digest)
    if (!o) {
      o = {
        digest: m.digest,
        address: addressOf(m.order.sender),
        senderSubaccount: m.order.sender,
        isolated: m.isolated,
        productId: productIdOfMatch(m),
        isBuy: base > 0,
        qty: 0,
        notional: 0,
        fillCount: 0,
        isTaker: m.is_taker,
        newestIdx: m.submission_idx,
      }
      orders.set(m.digest, o)
    }
    o.qty += Math.abs(base)
    o.notional += quote
    o.fillCount += 1
    if (BigInt(m.submission_idx) > BigInt(o.newestIdx)) o.newestIdx = m.submission_idx
  }
  // tape is newest-first; keep that order for the feed
  return [...orders.values()].sort((a, b) => (BigInt(b.newestIdx) > BigInt(a.newestIdx) ? 1 : -1))
}

/** Just enough of a LeaderRow for CopyModal to target the right subaccount. */
function leaderRowFromOrder(o: WhaleOrder): LeaderRow {
  return {
    address: o.address,
    volume: o.notional,
    fills: o.fillCount,
    realizedPnl: 0,
    feesPaid: 0,
    takerFills: o.isTaker ? o.fillCount : 0,
    builders: new Set(),
    crossSubaccounts: o.isolated ? new Map() : new Map([[o.senderSubaccount, o.notional]]),
    portfolio: null,
  }
}

export function Tracker() {
  const [threshold, setThreshold] = useState(5_000)
  const [selected, setSelected] = useState<WhaleOrder | null>(null)
  const [copyTarget, setCopyTarget] = useState<WhaleOrder | null>(null)

  const { data: matches, isPending } = useWhaleTape()
  const { data: symbols } = useSymbols()
  const { data: calibration } = useIdxCalibration()

  const whales = matches ? groupIntoOrders(matches).filter((o) => o.notional >= threshold) : []
  const totalNotional = whales.reduce((a, o) => a + o.notional, 0)
  const biggest = whales.reduce<WhaleOrder | null>((a, o) => (a && a.notional >= o.notional ? a : o), null)

  // Flash rows that are new since the last poll — but never on first load, where
  // every row would be "new" and the whole feed would flash at once (noise, not signal).
  const [freshDigests, setFreshDigests] = useState<Set<string>>(new Set())
  const seenRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!matches) return
    const current = new Set(groupIntoOrders(matches).map((o) => o.digest))
    if (seenRef.current === null) {
      seenRef.current = current
      return
    }
    const fresh = new Set<string>()
    for (const d of current) if (!seenRef.current.has(d)) fresh.add(d)
    seenRef.current = current
    if (fresh.size === 0) return
    setFreshDigests(fresh)
    const t = setTimeout(() => setFreshDigests(new Set()), 1400)
    return () => clearTimeout(t)
  }, [matches])

  return (
    <div className="space-y-4">
      {!isPending && whales.length > 0 && (
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-700/60 bg-ink-900/70 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">Whale orders in window</div>
            <div className="tnum font-display mt-1 text-xl font-semibold text-slate-100">{whales.length}</div>
          </div>
          <div className="rounded-2xl border border-ink-700/60 bg-ink-900/70 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">Whale volume</div>
            <div className="tnum font-display mt-1 text-xl font-semibold text-slate-100">
              {usd(totalNotional, { compact: true })}
            </div>
          </div>
          <div className="rounded-2xl border border-mint-500/25 bg-mint-500/[0.06] p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">Biggest single order</div>
            <div className="tnum font-display mt-1 text-xl font-semibold text-mint-400">
              {biggest ? usd(biggest.notional, { compact: true }) : '—'}
              {biggest && (
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {symbols?.get(biggest.productId)?.symbol ?? `#${biggest.productId}`}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <Panel
        title="Live whale feed"
        desc="The biggest orders hitting Nado right now, grouped per order — not self-reported, straight off the public tape. Click a row for the trader's history, or copy them on the spot."
        right={
          <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700/60 bg-ink-850/80 p-1">
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                onClick={() => setThreshold(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  threshold === t ? 'bg-mint-500/20 text-mint-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                ≥{usd(t, { compact: true })}
              </button>
            ))}
          </div>
        }
      >
        {isPending ? (
          <Skeleton rows={10} />
        ) : whales.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No orders ≥ {usd(threshold, { compact: true })} in the current window — try a lower threshold.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-3 text-left font-semibold">Trader</th>
                  <th className="px-3 py-3 text-left font-semibold">Market</th>
                  <th className="px-3 py-3 text-left font-semibold">Side</th>
                  <th className="px-3 py-3 text-right font-semibold">Size</th>
                  <th className="px-3 py-3 text-right font-semibold">Value</th>
                  <th className="px-3 py-3 text-right font-semibold">Fills</th>
                  <th
                    className="px-3 py-3 text-right font-semibold"
                    title="Estimated from sequencer position — Nado's tape doesn't carry an exact timestamp"
                  >
                    When ~
                  </th>
                  <th className="px-6 py-3 text-right font-semibold" />
                </tr>
              </thead>
              <tbody>
                {whales.map((o, i) => (
                  <tr
                    key={o.digest}
                    onClick={() => setSelected(o)}
                    style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }}
                    className={`rise-in group cursor-pointer border-b border-ink-800/50 transition-colors last:border-0 hover:bg-ink-850/50 ${
                      freshDigests.has(o.digest) ? 'flash-new' : ''
                    }`}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar seed={o.address} size={26} />
                        <a
                          href={`https://explorer.inkonchain.com/address/${o.address}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="tnum whitespace-nowrap text-slate-200 transition-colors hover:text-mint-400"
                        >
                          {shortAddr(o.address)}
                        </a>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {symbols?.get(o.productId)?.symbol ?? `#${o.productId}`}
                    </td>
                    <td className="px-3 py-3">
                      <Pill tone={o.isBuy ? 'up' : 'down'}>{o.isBuy ? 'Buy' : 'Sell'}</Pill>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-slate-400">{o.qty.toFixed(4)}</td>
                    <td
                      className={`tnum px-3 py-3 text-right font-medium ${
                        o.notional >= threshold * 10 ? 'text-mint-400' : 'text-slate-200'
                      }`}
                    >
                      {usd(o.notional, { compact: true })}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-slate-500">{o.fillCount}</td>
                    <td className="px-3 py-3 text-right text-xs text-slate-500">
                      {calibration ? timeAgo(estimateTimestamp(o.newestIdx, calibration)) : '…'}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setCopyTarget(o)
                        }}
                        className="rounded-md border border-mint-500/30 bg-mint-500/[0.08] px-2.5 py-1 text-xs font-medium text-mint-400 opacity-0 transition-opacity hover:bg-mint-500/[0.16] group-hover:opacity-100"
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected && (
        <ProfileModal
          address={selected.address}
          subaccount={selected.senderSubaccount}
          onClose={() => setSelected(null)}
        />
      )}

      {copyTarget && <CopyModal leader={leaderRowFromOrder(copyTarget)} onClose={() => setCopyTarget(null)} />}
    </div>
  )
}
