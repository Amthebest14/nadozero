import { useEffect, useState } from 'react'
import { useAccountSnapshot, usePortfolioSummary, useSymbols, type LeaderRow } from '../lib/hooks'
import { shortAddr } from '../lib/nado'
import { usd, pnlColor } from '../lib/format'
import { Avatar, Pill, Skeleton, Sparkline } from './ui'
import { TradeHistoryModal } from './TradeHistoryModal'
import { CopyModal } from './CopyModal'
import { PnlCard } from './PnlCard'

/** Just enough of a LeaderRow for CopyModal to target the right subaccount. */
function leaderRowFor(address: string, subaccount: string, portfolio: LeaderRow['portfolio']): LeaderRow {
  return {
    address,
    volume: 0,
    fills: 0,
    realizedPnl: 0,
    feesPaid: 0,
    takerFills: 0,
    builders: new Set(),
    crossSubaccounts: new Map([[subaccount, 1]]),
    portfolio,
  }
}

export function ProfileModal({
  address,
  subaccount,
  onClose,
}: {
  address: string
  subaccount: string
  onClose: () => void
}) {
  const { data: summary, isPending } = usePortfolioSummary(subaccount)
  const { data: snap } = useAccountSnapshot(subaccount)
  const { data: symbols } = useSymbols()
  const [showTrades, setShowTrades] = useState(false)
  const [copying, setCopying] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${location.origin}/?trader=${address}`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1600)
  }

  const positions = snap?.perps.slice(0, 4) ?? []

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900/95 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-ink-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <Avatar seed={address} size={38} />
            <div>
              <a
                href={`https://explorer.inkonchain.com/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="tnum text-[14px] font-medium text-slate-100 hover:text-mint-400"
              >
                {shortAddr(address)}
              </a>
              <div className="text-[11px] text-slate-500">Trader profile — verified from Nado's public archive</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-[11.5px] font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              {linkCopied ? 'Copied ✓' : 'Copy link'}
            </button>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border border-ink-700 text-slate-500 transition-colors hover:border-ink-600 hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="overflow-y-auto p-6">
          {isPending ? (
            <Skeleton rows={6} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Account value', summary ? usd(summary.accountValue, { compact: true }) : '—', ''],
                  ['7d PnL', summary ? usd(summary.pnlWeek, { compact: true, sign: true }) : '—', summary ? pnlColor(summary.pnlWeek) : ''],
                  ['30d PnL', summary ? usd(summary.pnlMonth, { compact: true, sign: true }) : '—', summary ? pnlColor(summary.pnlMonth) : ''],
                  ['All-time PnL', summary ? usd(summary.pnlAll, { compact: true, sign: true }) : '—', summary ? pnlColor(summary.pnlAll) : ''],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl border border-ink-700/60 bg-ink-850/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                    <div className={`tnum mt-1 text-[16px] font-semibold ${tone || 'text-slate-100'}`}>{value}</div>
                  </div>
                ))}
              </div>

              {summary && summary.curve.length >= 2 && (
                <div className="mt-4 rounded-xl border border-ink-700/60 bg-ink-850/50 p-4">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">7d account value</div>
                  <Sparkline data={summary.curve} width={560} height={64} />
                </div>
              )}

              {positions.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                    Open positions right now
                  </div>
                  <div className="space-y-1.5">
                    {positions.map((p) => (
                      <div
                        key={p.productId}
                        className="flex items-center justify-between rounded-lg border border-ink-800/70 bg-ink-900/60 px-3 py-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[12.5px] text-slate-300">
                            {symbols?.get(p.productId)?.symbol ?? `#${p.productId}`}
                          </span>
                          <Pill tone={p.amount > 0 ? 'up' : 'down'}>{p.amount > 0 ? 'Long' : 'Short'}</Pill>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="tnum text-[12.5px] text-slate-400">{usd(p.notional, { compact: true })}</span>
                          <span className={`tnum text-[12.5px] ${pnlColor(p.unrealizedPnl)}`}>
                            {usd(p.unrealizedPnl, { sign: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                    {snap && snap.perps.length > positions.length && (
                      <div className="text-[11px] text-slate-600">
                        + {snap.perps.length - positions.length} more positions
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => setCopying(true)}
                  className="flex-1 rounded-lg border border-mint-500/30 bg-mint-500/[0.1] py-2.5 text-[12.5px] font-medium text-mint-400 transition-colors hover:bg-mint-500/[0.18]"
                >
                  Copy this trader
                </button>
                <button
                  onClick={() => setShowTrades(true)}
                  className="flex-1 rounded-lg border border-ink-600 bg-ink-800/60 py-2.5 text-[12.5px] font-medium text-slate-300 transition-colors hover:border-slate-500"
                >
                  View trades
                </button>
                <button
                  onClick={() => setSharing(true)}
                  disabled={!summary}
                  className="flex-1 rounded-lg border border-ink-600 bg-ink-800/60 py-2.5 text-[12.5px] font-medium text-slate-300 transition-colors hover:border-slate-500 disabled:opacity-40"
                >
                  Share PnL card
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showTrades && <TradeHistoryModal address={address} subaccount={subaccount} onClose={() => setShowTrades(false)} />}
      {copying && (
        <CopyModal leader={leaderRowFor(address, subaccount, summary ?? null)} onClose={() => setCopying(false)} />
      )}
      {sharing && summary && <PnlCard address={address} summary={summary} onClose={() => setSharing(false)} />}
    </div>
  )
}
