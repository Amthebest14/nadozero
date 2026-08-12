import { useState } from 'react'
import { useAccountSnapshot, usePortfolioSummary, useSymbols } from '../lib/hooks'
import { defaultSubaccountOf } from '../lib/nado'
import type { WalletState } from '../lib/useWallet'
import { usd, pnlColor } from '../lib/format'
import { Panel, Pill, Skeleton, Sparkline } from './ui'
import { TradeHistoryModal } from './TradeHistoryModal'
import { PnlCard } from './PnlCard'

export function Portfolio({ wallet }: { wallet: WalletState }) {
  const subaccount = wallet.account && wallet.verified ? defaultSubaccountOf(wallet.account) : null
  const { data: snap, isPending } = useAccountSnapshot(subaccount)
  const { data: summary } = usePortfolioSummary(subaccount)
  const { data: symbols } = useSymbols()
  const [sharing, setSharing] = useState(false)
  const [showTrades, setShowTrades] = useState(false)

  if (!wallet.account || !wallet.verified) {
    return (
      <Panel title="Portfolio" desc="Your own positions, balances and PnL — read straight from the sequencer.">
        <div className="p-6">
          <button
            onClick={() => wallet.connect()}
            disabled={wallet.busy}
            className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
          >
            {wallet.busy ? 'Connecting…' : 'Connect wallet to see your portfolio'}
          </button>
        </div>
      </Panel>
    )
  }

  const usdt0 = snap?.spots.find((s) => s.productId === 0)
  const holdings = snap?.spots.filter((s) => s.productId !== 0) ?? []

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Account value', snap ? usd(snap.accountValue, { compact: true }) : '—', 'text-slate-100'],
          ['USDT0 available', usdt0 ? usd(usdt0.valueUsd) : snap ? '$0.00' : '—', 'text-slate-100'],
          ['7d PnL', summary ? usd(summary.pnlWeek, { sign: true }) : '—', summary ? pnlColor(summary.pnlWeek) : 'text-slate-100'],
          ['30d PnL', summary ? usd(summary.pnlMonth, { sign: true }) : '—', summary ? pnlColor(summary.pnlMonth) : 'text-slate-100'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-ink-700/60 bg-ink-900/70 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
            <div className={`tnum font-display mt-1 text-xl font-semibold ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      {summary && summary.curve.length >= 2 && (
        <Panel title="Equity curve" desc="Your account value over the last 7 days, from Nado's archive.">
          <div className="p-6">
            <Sparkline data={summary.curve} width={720} height={80} />
          </div>
        </Panel>
      )}

      <Panel
        title="Open positions"
        desc="Live from the sequencer — this is your default subaccount, where copies trade."
        right={
          <div className="flex gap-2">
            <button
              onClick={() => setShowTrades(true)}
              className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:border-slate-500"
            >
              My trades
            </button>
            <button
              onClick={() => setSharing(true)}
              disabled={!summary}
              className="rounded-lg border border-mint-500/30 bg-mint-500/[0.1] px-3 py-1.5 text-sm font-medium text-mint-400 hover:bg-mint-500/[0.18] disabled:opacity-40"
            >
              Share PnL card
            </button>
          </div>
        }
      >
        {isPending ? (
          <Skeleton rows={4} />
        ) : !snap?.perps.length ? (
          <div className="p-8 text-center text-sm text-slate-500">No open positions.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-3 text-left font-semibold">Market</th>
                  <th className="px-3 py-3 text-left font-semibold">Side</th>
                  <th className="px-3 py-3 text-right font-semibold">Size</th>
                  <th className="px-3 py-3 text-right font-semibold">Oracle price</th>
                  <th className="px-3 py-3 text-right font-semibold">Notional</th>
                  <th className="px-6 py-3 text-right font-semibold">Unrealized PnL</th>
                </tr>
              </thead>
              <tbody>
                {snap.perps.map((p) => (
                  <tr key={p.productId} className="border-b border-ink-800/50 last:border-0">
                    <td className="px-6 py-3 text-slate-300">{symbols?.get(p.productId)?.symbol ?? `#${p.productId}`}</td>
                    <td className="px-3 py-3">
                      <Pill tone={p.amount > 0 ? 'up' : 'down'}>{p.amount > 0 ? 'Long' : 'Short'}</Pill>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-slate-400">{Math.abs(p.amount).toFixed(4)}</td>
                    <td className="tnum px-3 py-3 text-right text-slate-400">
                      {p.oraclePrice.toLocaleString(undefined, { maximumFractionDigits: p.oraclePrice < 1 ? 6 : 2 })}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-slate-300">{usd(p.notional, { compact: true })}</td>
                    <td className={`tnum px-6 py-3 text-right ${pnlColor(p.unrealizedPnl)}`}>
                      {usd(p.unrealizedPnl, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {holdings.length > 0 && (
        <Panel title="Spot holdings" desc="Non-USDT0 spot balances, valued at oracle prices.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-700/50 text-xs uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-3 text-left font-semibold">Asset</th>
                  <th className="px-3 py-3 text-right font-semibold">Amount</th>
                  <th className="px-6 py-3 text-right font-semibold">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.productId} className="border-b border-ink-800/50 last:border-0">
                    <td className="px-6 py-3 text-slate-300">{symbols?.get(h.productId)?.symbol ?? `#${h.productId}`}</td>
                    <td className="tnum px-3 py-3 text-right text-slate-400">{h.amount.toFixed(6)}</td>
                    <td className="tnum px-6 py-3 text-right text-slate-300">{usd(h.valueUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {showTrades && subaccount && (
        <TradeHistoryModal address={wallet.account} subaccount={subaccount} onClose={() => setShowTrades(false)} />
      )}
      {sharing && summary && wallet.account && (
        <PnlCard address={wallet.account} summary={summary} onClose={() => setSharing(false)} />
      )}
    </div>
  )
}
