import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listCopies, pauseCopy, resumeCopy, setCopyTelegram, stopCopy, type CopyRecord } from '../lib/engineApi'
import { defaultSubaccountOf, timeAgo, shortAddr } from '../lib/nado'
import { useAccountPnlSince } from '../lib/hooks'
import type { WalletState } from '../lib/useWallet'
import { Avatar, Panel, Pill, Skeleton } from './ui'
import { usd, pnlColor } from '../lib/format'
import { TradeHistoryModal } from './TradeHistoryModal'

function sizingLabel(c: CopyRecord) {
  return c.mode === 'fixed' ? `$${c.fixedUsd} per trade` : `$${c.allocationUsd} allocated (proportional)`
}

function statusTone(status: CopyRecord['status']): 'up' | 'down' | 'default' {
  if (status === 'active') return 'up'
  if (status === 'stopped') return 'down'
  return 'default'
}

const TELEGRAM_BOT_USERNAME = 'Nadozerobot'

function CopyRow({ copy, onViewTrades }: { copy: CopyRecord; onViewTrades: () => void }) {
  const qc = useQueryClient()
  const [confirmingStop, setConfirmingStop] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-copies'] })
  const pauseMut = useMutation({ mutationFn: () => pauseCopy(copy.id), onSuccess: invalidate })
  const resumeMut = useMutation({ mutationFn: () => resumeCopy(copy.id), onSuccess: invalidate })
  const stopMut = useMutation({ mutationFn: () => stopCopy(copy.id), onSuccess: invalidate })
  const telegramMut = useMutation({ mutationFn: () => setCopyTelegram(copy.id, null), onSuccess: invalidate })

  const busy = pauseMut.isPending || resumeMut.isPending || stopMut.isPending
  const { data: pnl } = useAccountPnlSince(copy.followerSubaccount, copy.createdAt)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800/50 px-6 py-4 last:border-0">
      <div className="flex items-center gap-3">
        <Avatar seed={copy.leaderAddress} size={32} />
        <div>
          <div className="flex items-center gap-2">
            <a
              href={`https://explorer.inkonchain.com/address/${copy.leaderAddress}`}
              target="_blank"
              rel="noreferrer"
              className="tnum text-sm font-medium text-slate-200 hover:text-mint-400"
            >
              {shortAddr(copy.leaderAddress)}
            </a>
            <Pill tone={statusTone(copy.status)}>{copy.status}</Pill>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {sizingLabel(copy)} · max {(copy.maxSlippagePct * 100).toFixed(2)}% slippage
            {copy.maxPositionUsd !== null && ` · $${copy.maxPositionUsd} position cap`} · started{' '}
            {timeAgo(new Date(copy.createdAt))}
          </div>
          {copy.status === 'paused' && copy.lastError && (
            <div className="mt-1 text-xs text-[--color-down]">
              {copy.lastError}
              {copy.lastErrorAt && ` · ${timeAgo(new Date(copy.lastErrorAt))}`}
            </div>
          )}

          {copy.telegramChatId ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span>🔔 Telegram alerts on</span>
              <button
                onClick={() => telegramMut.mutate()}
                disabled={telegramMut.isPending}
                className="text-slate-500 underline decoration-dotted hover:text-[--color-down] disabled:opacity-50"
              >
                disconnect
              </button>
            </div>
          ) : (
            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${copy.id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-slate-500 underline decoration-dotted hover:text-slate-300"
            >
              🔔 Connect Telegram alerts — one tap, no typing
            </a>
          )}
        </div>
      </div>

      {pnl && pnl.fillCount > 0 && (
        <div className="text-right" title="Your account's net PnL minus fees since this copy started — if you're running more than one copy at once, this reflects the whole account, not just this relationship">
          <div className="text-xs uppercase tracking-wider text-slate-500">Net since started</div>
          <div className={`tnum text-base font-medium ${pnlColor(pnl.netUsd)}`}>{usd(pnl.netUsd, { sign: true })}</div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onViewTrades}
          className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:border-slate-500"
        >
          View my trades
        </button>
        {copy.status === 'active' ? (
          <button
            onClick={() => pauseMut.mutate()}
            disabled={busy}
            className="rounded-lg border border-ink-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:border-slate-500 disabled:opacity-50"
          >
            Pause
          </button>
        ) : copy.status === 'paused' ? (
          <button
            onClick={() => resumeMut.mutate()}
            disabled={busy}
            className="rounded-lg border border-mint-500/30 bg-mint-500/[0.08] px-3 py-1.5 text-sm font-medium text-mint-400 hover:bg-mint-500/[0.16] disabled:opacity-50"
          >
            Resume
          </button>
        ) : null}
        {copy.status !== 'stopped' &&
          (confirmingStop ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stopMut.mutate()}
                disabled={busy}
                className="rounded-lg border border-[--color-down]/30 bg-[--color-down]/[0.1] px-3 py-1.5 text-sm font-medium text-[--color-down] disabled:opacity-50"
              >
                Confirm stop
              </button>
              <button
                onClick={() => setConfirmingStop(false)}
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingStop(true)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm font-medium text-slate-500 hover:border-[--color-down]/40 hover:text-[--color-down]"
            >
              Stop
            </button>
          ))}
      </div>
    </div>
  )
}

export function MyCopies({ wallet }: { wallet: WalletState }) {
  const [viewingTradesFor, setViewingTradesFor] = useState<CopyRecord | null>(null)

  const { data: copies, isPending, isError, error } = useQuery({
    queryKey: ['my-copies', wallet.account],
    queryFn: () => listCopies(wallet.account!),
    enabled: !!wallet.account && wallet.verified,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  if (!wallet.account || !wallet.verified) {
    return (
      <Panel title="My copies" desc="See and manage the traders you're currently copying.">
        <div className="p-6">
          <button
            onClick={() => wallet.connect()}
            disabled={wallet.busy}
            className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
          >
            {wallet.busy ? 'Connecting…' : 'Connect wallet to see your copies'}
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <>
      <Panel title="My copies" desc="See and manage the traders you're currently copying.">
        {isPending ? (
          <Skeleton rows={3} />
        ) : isError ? (
          <div className="p-6 text-sm text-[--color-down]">
            {error instanceof Error ? error.message : 'Could not load your copies.'}
          </div>
        ) : !copies?.length ? (
          <div className="p-10 text-center text-sm text-slate-500">
            You're not copying anyone yet — head to the leaderboard and click "Copy this trader."
          </div>
        ) : (
          <div>
            {copies.map((c) => (
              <CopyRow key={c.id} copy={c} onViewTrades={() => setViewingTradesFor(c)} />
            ))}
          </div>
        )}
      </Panel>

      {viewingTradesFor && (
        <TradeHistoryModal
          address={viewingTradesFor.followerWalletAddress}
          subaccount={viewingTradesFor.followerSubaccount ?? defaultSubaccountOf(viewingTradesFor.followerWalletAddress)}
          onClose={() => setViewingTradesFor(null)}
        />
      )}
    </>
  )
}
