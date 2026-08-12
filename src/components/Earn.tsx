import { useState } from 'react'
import {
  burnNlp,
  mintNlp,
  subaccountOf,
  walletErrorMessage,
} from '../lib/gateway'
import { useNlpLockedBalances, useNlpPoolInfo } from '../lib/hooks'
import type { WalletState } from '../lib/useWallet'
import { usd } from '../lib/format'
import { Panel, Skeleton } from './ui'

type Status = { kind: 'idle' } | { kind: 'busy'; label: string } | { kind: 'success'; msg: string } | { kind: 'error'; msg: string }

export function Earn({ wallet }: { wallet: WalletState }) {
  const [depositAmount, setDepositAmount] = useState('50')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const { data: pools, isPending: poolsPending } = useNlpPoolInfo()
  const subaccount = wallet.account ? subaccountOf(wallet.account) : null
  const { data: mine, isPending: minePending, refetch: refetchMine } = useNlpLockedBalances(subaccount)

  const pool = pools?.[0]

  async function onDeposit() {
    if (!wallet.account) return
    const amt = Number(depositAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setStatus({ kind: 'error', msg: 'Enter a positive amount.' })
      return
    }
    setStatus({ kind: 'busy', label: 'Depositing — check your wallet for a signature prompt' })
    try {
      const result = await mintNlp(wallet.account, amt)
      if (result.status === 'success') {
        setStatus({ kind: 'success', msg: `Deposited $${amt}. Locked for 4 days from now.` })
        refetchMine()
      } else {
        setStatus({ kind: 'error', msg: result.error ?? 'Deposit failed.' })
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: walletErrorMessage(e) })
    }
  }

  async function onWithdraw() {
    if (!wallet.account) return
    const amt = Number(withdrawAmount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setStatus({ kind: 'error', msg: 'Enter a positive amount.' })
      return
    }
    if (mine && amt > mine.unlockedAmount) {
      setStatus({ kind: 'error', msg: `Only $${mine.unlockedAmount.toFixed(2)} is unlocked and withdrawable right now.` })
      return
    }
    setStatus({ kind: 'busy', label: 'Withdrawing — check your wallet for a signature prompt' })
    try {
      const result = await burnNlp(wallet.account, amt)
      if (result.status === 'success') {
        setStatus({ kind: 'success', msg: `Withdrew ${amt} NLP tokens.` })
        setWithdrawAmount('')
        refetchMine()
      } else {
        setStatus({ kind: 'error', msg: result.error ?? 'Withdrawal failed.' })
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: walletErrorMessage(e) })
    }
  }

  const busy = status.kind === 'busy'

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[12.5px] leading-relaxed text-amber-300">
        <strong>This is Nado's own vault, not NadoZero's.</strong> We wrap their deposit/withdraw calls — we
        don't run any strategy or hold your funds ourselves. Yield comes from the vault's own market-making and
        liquidation PnL, shared across everyone in it — which means it can go down as well as up. A 4-day lock
        applies after every deposit, and withdrawals pay a small fee (1 USDT0, plus the greater of 1 USDT0 or
        0.10% of the amount) that goes back to remaining depositors, not to Nado or NadoZero.
      </div>

      <Panel title="Pool" desc="Nado's own liquidity-provider vault — live size, from Nado's public data.">
        {poolsPending ? (
          <Skeleton rows={2} />
        ) : pool ? (
          <div className="grid grid-cols-2 gap-3 p-6 text-[13px]">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Pool assets</div>
              <div className="tnum mt-0.5 text-[16px] font-medium text-slate-200">{usd(pool.assets, { compact: true })}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Pool liabilities</div>
              <div className="tnum mt-0.5 text-[16px] font-medium text-slate-400">{usd(pool.liabilities, { compact: true })}</div>
            </div>
            <p className="col-span-2 text-[11px] text-slate-600">
              Liabilities here reflect the vault's open market-making positions in Nado's risk-weighted margin
              system, not debt in the everyday sense. We don't compute an APY ourselves — check Nado's own app
              for historical performance before depositing anything meaningful.
            </p>
          </div>
        ) : (
          <div className="p-6 text-[13px] text-slate-500">No pool data available right now.</div>
        )}
      </Panel>

      {!wallet.account || !wallet.verified ? (
        <Panel title="Your position">
          <div className="p-6">
            <button
              onClick={() => wallet.connect()}
              disabled={wallet.busy}
              className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-[13px] font-semibold text-ink-950 disabled:opacity-50"
            >
              {wallet.busy ? 'Connecting…' : 'Connect wallet to deposit or withdraw'}
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title="Your position">
            {minePending ? (
              <Skeleton rows={2} />
            ) : (
              <div className="grid grid-cols-2 gap-3 p-6 text-[13px]">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Withdrawable now</div>
                  <div className="tnum mt-0.5 text-[16px] font-medium text-mint-400">
                    {usd(mine?.unlockedAmount ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Still locked</div>
                  <div className="tnum mt-0.5 text-[16px] font-medium text-slate-300">
                    {usd(mine?.lockedAmount ?? 0)}
                  </div>
                </div>
                {mine && mine.locked.length > 0 && (
                  <div className="col-span-2 space-y-1">
                    {mine.locked.map((l, i) => (
                      <div key={i} className="flex justify-between text-[11.5px] text-slate-500">
                        <span>{usd(l.amount)}</span>
                        <span>unlocks {l.unlocksAt.toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Deposit">
            <div className="space-y-3 p-6">
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
              />
              <button
                onClick={onDeposit}
                disabled={busy}
                className="w-full rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 py-2.5 text-[13px] font-semibold text-ink-950 disabled:opacity-50"
              >
                Deposit ${depositAmount || '0'} USDT0
              </button>
            </div>
          </Panel>

          <Panel title="Withdraw">
            <div className="space-y-3 p-6">
              <input
                type="number"
                min={0.01}
                step="0.01"
                placeholder={`up to ${(mine?.unlockedAmount ?? 0).toFixed(2)}`}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
              />
              <button
                onClick={onWithdraw}
                disabled={busy || !mine?.unlockedAmount}
                className="w-full rounded-lg border border-ink-600 py-2.5 text-[13px] font-medium text-slate-300 hover:border-slate-500 disabled:opacity-40"
              >
                Withdraw
              </button>
            </div>
          </Panel>
        </>
      )}

      {status.kind === 'busy' && (
        <div className="flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-850/50 px-4 py-3">
          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
          <span className="text-[13px] text-slate-300">{status.label}</span>
        </div>
      )}
      {status.kind === 'success' && (
        <div className="rounded-lg border border-mint-500/25 bg-mint-500/[0.08] px-3 py-2 text-[12.5px] text-mint-400">
          {status.msg}
        </div>
      )}
      {status.kind === 'error' && (
        <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2 text-[12.5px] text-[--color-down]">
          {status.msg}
        </div>
      )}
    </div>
  )
}
