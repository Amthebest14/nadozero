import { useEffect } from 'react'
import { useIdxCalibration, useTraderHistory, useSymbols } from '../lib/hooks'
import { decodeAppendix, estimateTimestamp, fromX18, productIdOfMatch, shortAddr, timeAgo } from '../lib/nado'
import { usd, pnlColor } from '../lib/format'
import { Avatar, Pill, Skeleton } from './ui'

export function TradeHistoryModal({
  address,
  subaccount,
  onClose,
}: {
  address: string
  subaccount: string
  onClose: () => void
}) {
  const { data: matches, isPending } = useTraderHistory(subaccount)
  const { data: symbols } = useSymbols()
  const { data: calibration } = useIdxCalibration()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const rows = (matches ?? []).map((m) => {
    const qty = Math.abs(fromX18(m.base_filled))
    const price = fromX18(m.order.priceX18)
    const notional = qty * price
    const { builderId } = decodeAppendix(m.order.appendix)
    const isBuy = Number(m.base_filled) > 0
    const productId = productIdOfMatch(m)
    return {
      digest: m.digest,
      symbol: symbols?.get(productId)?.symbol,
      productId,
      isBuy,
      qty,
      price,
      notional,
      fee: fromX18(m.fee),
      pnl: fromX18(m.realized_pnl),
      isTaker: m.is_taker,
      builderId,
      submissionIdx: m.submission_idx,
      when: calibration ? estimateTimestamp(m.submission_idx, calibration) : null,
    }
  })

  const totalVolume = rows.reduce((a, r) => a + r.notional, 0)
  const totalFees = rows.reduce((a, r) => a + r.fee, 0)
  const totalPnl = rows.reduce((a, r) => a + r.pnl, 0)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900/95 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-ink-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <Avatar seed={address} size={34} />
            <div>
              <div className="tnum text-sm font-medium text-slate-100">{shortAddr(address)}</div>
              <div className="text-xs text-slate-500">Recent trade history — most recent 50 fills</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg border border-ink-700 text-slate-500 transition-colors hover:border-ink-600 hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {!isPending && rows.length > 0 && (
          <div className="grid grid-cols-3 gap-3 border-b border-ink-700/60 px-6 py-3.5 text-center">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Volume shown</div>
              <div className="tnum mt-0.5 text-base font-medium text-slate-200">{usd(totalVolume, { compact: true })}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Fees shown</div>
              <div className="tnum mt-0.5 text-base font-medium text-slate-400">{usd(totalFees)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Realized PnL shown</div>
              <div className={`tnum mt-0.5 text-base font-medium ${pnlColor(totalPnl)}`}>
                {usd(totalPnl, { sign: true })}
              </div>
            </div>
          </div>
        )}

        <div className="overflow-y-auto">
          {isPending ? (
            <Skeleton rows={8} />
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No recent fills found for this subaccount.</div>
          ) : (
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead className="sticky top-0 bg-ink-900">
                <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-2.5 text-left font-semibold">Market</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Side</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Size</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Price</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Fee</th>
                  <th className="px-3 py-2.5 text-right font-semibold">PnL</th>
                  <th className="px-6 py-2.5 text-right font-semibold" title="Estimated from sequencer position — Nado's trade history doesn't carry an exact timestamp">
                    When ~
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.digest} className="border-b border-ink-800/50 last:border-0 hover:bg-ink-850/50">
                    <td className="px-6 py-2.5 text-slate-300">
                      {r.symbol ?? `#${r.productId}`}
                      {r.builderId ? (
                        <span className="ml-1.5 text-xs text-mint-500/70">builder #{r.builderId}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill tone={r.isBuy ? 'up' : 'down'}>{r.isBuy ? 'Buy' : 'Sell'}</Pill>
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-slate-400">{r.qty.toFixed(4)}</td>
                    <td className="tnum px-3 py-2.5 text-right text-slate-400">
                      {r.price.toLocaleString(undefined, {
                        maximumFractionDigits: r.price < 1 ? 6 : 2,
                      })}
                    </td>
                    <td className="tnum px-3 py-2.5 text-right text-slate-300">{usd(r.notional, { compact: true })}</td>
                    <td className="tnum px-3 py-2.5 text-right text-slate-500">{usd(r.fee)}</td>
                    <td className={`tnum px-3 py-2.5 text-right ${r.pnl ? pnlColor(r.pnl) : 'text-slate-600'}`}>
                      {r.pnl ? usd(r.pnl, { sign: true }) : '—'}
                    </td>
                    <td className="px-6 py-2.5 text-right text-xs text-slate-500" title={r.when?.toLocaleString()}>
                      {r.when ? timeAgo(r.when) : '…'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

