import { useEffect, useState } from 'react'
import {
  connectWallet,
  depositUsdt0,
  ensureUsdt0Allowance,
  fetchSubaccountUsdt0Balance,
  fetchUsdt0Balance,
  generateFollowerSigner,
  isInkChain,
  linkSigner,
  signerBytes32Of,
  subaccountOf,
  usdt0ToRaw,
  USDT0_DECIMALS,
  verifyWalletPresence,
  walletErrorMessage,
} from '../lib/gateway'
import { registerCopy, type CopyMode } from '../lib/engineApi'
import { defaultSubaccountOf, primarySubaccount, shortAddr } from '../lib/nado'
import { useLeaderFrequency, type LeaderRow } from '../lib/hooks'
import { usd, pnlColor } from '../lib/format'
import { Avatar } from './ui'

/**
 * Measured live in production (2026-08-12): every fill on this account paid
 * an identical $0.035 regardless of notional — a flat per-order floor, not a
 * percentage. Used only to WARN before setup, never to size anything, so a
 * stale estimate degrades gracefully rather than silently misprice a trade.
 */
const ESTIMATED_FLAT_FEE_USD = 0.035

type Step =
  | 'amount'
  | 'connecting'
  | 'verifying'
  | 'checking-funds'
  | 'needs-funds'
  | 'approving'
  | 'depositing'
  | 'generating'
  | 'linking'
  | 'registering'
  | 'done'
  | 'error'

const MIN_USDT0 = 5

const STEP_LABEL: Partial<Record<Step, string>> = {
  connecting: 'Connect your wallet',
  verifying: 'Approve one signature to prove presence',
  'checking-funds': 'Checking your subaccount balance',
  approving: 'Approve USDT0 spending — check your wallet',
  depositing: 'Confirm the deposit in your wallet',
  generating: 'Generating a dedicated signer key',
  linking: 'Approve one signature to authorize it',
  registering: 'Handing off to the mirror service',
}

const fromRaw = (raw: bigint) => Number(raw) / 10 ** USDT0_DECIMALS

export function CopyModal({ leader, onClose }: { leader: LeaderRow; onClose: () => void }) {
  const [mode, setMode] = useState<CopyMode>('fixed')
  const [amount, setAmount] = useState('100')
  const [fixedUsd, setFixedUsd] = useState('1')
  const [maxSlippagePctInput, setMaxSlippagePctInput] = useState('0.5') // percent, as typed — 0.5 means 0.5%
  const [maxPositionUsdInput, setMaxPositionUsdInput] = useState('50')
  const leaderSubaccount = primarySubaccount(leader) ?? defaultSubaccountOf(leader.address)
  const { data: leaderFreq } = useLeaderFrequency(leaderSubaccount)
  const [risksAcknowledged, setRisksAcknowledged] = useState(false)
  const [step, setStep] = useState<Step>('amount')
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null)
  const [followerKey, setFollowerKey] = useState<{ address: string; privateKey: string } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && step !== 'done' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose, step])

  /**
   * Reads the subaccount's live balance straight from the sequencer
   * (subaccount_info), not the Archive indexer — a deposit made seconds ago
   * may not be indexed yet, which previously made a genuinely-funded
   * subaccount read as empty right after depositing.
   */
  async function checkFunding(addr: string): Promise<boolean> {
    setStep('checking-funds')
    try {
      const raw = await fetchSubaccountUsdt0Balance(subaccountOf(addr))
      const usdValue = Number(raw) / 1e18 // engine balances are x18-scaled, regardless of the token's own decimals
      return usdValue >= MIN_USDT0
    } catch {
      return false // subaccount doesn't exist on-chain yet — genuinely unfunded
    }
  }

  /**
   * Generates the follower key, links it on-chain, then hands it straight to
   * the mirror service — the key is never shown in the UI, never downloaded,
   * never sits in a file waiting to be misplaced. If registration fails
   * AFTER linking succeeds (e.g. the service is unreachable), the signer is
   * already live on-chain — retrying only re-attempts registration, it
   * doesn't re-link or generate a new key, so nothing is wasted or duplicated.
   */
  async function finishSetup(addr: string) {
    let key = followerKey
    if (!key) {
      setStep('generating')
      key = generateFollowerSigner()
      setFollowerKey(key)

      setStep('linking')
      const result = await linkSigner(addr, signerBytes32Of(key.address))
      if (result.status !== 'success') {
        setError(result.error ?? 'Linking failed.')
        setStep('error')
        return
      }
    }

    setStep('registering')
    try {
      await registerCopy({
        leaderAddress: leader.address,
        followerWalletAddress: addr,
        followerPrivateKey: key.privateKey as `0x${string}`,
        mode,
        allocationUsd: mode === 'proportional' ? Number(amount) : undefined,
        fixedUsd: mode === 'fixed' ? Number(fixedUsd) : undefined,
        maxSlippagePct: Number(maxSlippagePctInput) / 100,
        maxPositionUsd: Number(maxPositionUsdInput),
      })
    } catch (e) {
      setError(walletErrorMessage(e))
      setStep('error')
      return
    }
    setStep('done')
  }

  async function runSetup(walletAddr?: string) {
    setError(null)
    try {
      let addr = walletAddr ?? account
      if (!addr) {
        setStep('connecting')
        const conn = await connectWallet()
        if (!isInkChain(conn.chainId)) {
          setError('Wrong network — switch your wallet to Ink mainnet, then try again.')
          setStep('error')
          return
        }
        addr = conn.address
        setAccount(addr)
      }

      setStep('verifying')
      await verifyWalletPresence(addr)

      const funded = await checkFunding(addr)
      if (!funded) {
        const balance = await fetchUsdt0Balance(addr).catch(() => null)
        setWalletBalance(balance)
        setStep('needs-funds')
        return
      }

      await finishSetup(addr)
    } catch (e) {
      setError(walletErrorMessage(e))
      setStep('error')
    }
  }

  async function onDeposit() {
    if (!account) return
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed < MIN_USDT0) {
      setError(`Enter at least $${MIN_USDT0}.`)
      return
    }
    const amountRaw = usdt0ToRaw(parsed)
    if (walletBalance !== null && walletBalance < amountRaw) {
      setError(
        `Your wallet only holds ${fromRaw(walletBalance).toFixed(2)} USDT0 — reduce the amount or add funds to your wallet first.`,
      )
      return
    }

    setError(null)
    try {
      setStep('approving')
      await ensureUsdt0Allowance(account, amountRaw)

      setStep('depositing')
      await depositUsdt0(account, amountRaw)

      await finishSetup(account)
    } catch (e) {
      setError(walletErrorMessage(e))
      setStep('error')
    }
  }

  const p = leader.portfolio
  const busySteps: Step[] = [
    'connecting',
    'verifying',
    'checking-funds',
    'approving',
    'depositing',
    'generating',
    'linking',
    'registering',
  ]
  const busy = busySteps.includes(step)
  const closable = ['amount', 'needs-funds', 'done', 'error'].includes(step)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => closable && onClose()} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-900/95 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-ink-700/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <Avatar seed={leader.address} size={32} />
            <div>
              <div className="tnum text-sm font-medium text-slate-100">Copy {shortAddr(leader.address)}</div>
              <div className={`text-[11px] ${p ? pnlColor(p.pnlMonth) : 'text-slate-500'}`}>
                {p ? `${usd(p.pnlMonth, { compact: true, sign: true })} 30d PnL` : ''}
              </div>
            </div>
          </div>
          {closable && (
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border border-ink-700 text-slate-500 hover:border-ink-600 hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </header>

        <div className="p-6">
          {step === 'amount' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  How to size mirrored trades
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setMode('fixed')}
                    className={`rounded-lg border px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors ${
                      mode === 'fixed'
                        ? 'border-mint-500/50 bg-mint-500/[0.1] text-mint-400'
                        : 'border-ink-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    Fixed $ per trade
                  </button>
                  <button
                    onClick={() => setMode('proportional')}
                    className={`rounded-lg border px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors ${
                      mode === 'proportional'
                        ? 'border-mint-500/50 bg-mint-500/[0.1] text-mint-400'
                        : 'border-ink-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    Proportional
                  </button>
                </div>
              </div>

              {mode === 'fixed' ? (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Amount per trade (USDT0)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={fixedUsd}
                    onChange={(e) => setFixedUsd(e.target.value)}
                    className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    Every trade this leader makes, you trade this same dollar amount — regardless of how big
                    their trade is. Recommended when copying a much larger account.
                  </p>
                  {(() => {
                    const usdNum = Number(fixedUsd)
                    if (!leaderFreq || !Number.isFinite(usdNum) || usdNum <= 0) return null
                    const feePct = (ESTIMATED_FLAT_FEE_USD / usdNum) * 100
                    if (feePct < 3) return null
                    const hourlyBurn = ESTIMATED_FLAT_FEE_USD * leaderFreq.fillsPerHour
                    return (
                      <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-300">
                        <strong>This leader trades often</strong> — about {leaderFreq.fillsPerHour.toFixed(0)}×/hour
                        recently. Nado charges a flat ~${ESTIMATED_FLAT_FEE_USD.toFixed(3)} per order regardless of
                        size, so at ${usdNum} per trade that's ~{feePct.toFixed(1)}% gone to fees alone — roughly $
                        {hourlyBurn.toFixed(2)}/hour if every trade mirrors. Consider a larger amount, or expect
                        fees to matter more than price moves.
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Your allocation (USDT0)
                  </label>
                  <input
                    type="number"
                    min={MIN_USDT0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-600">
                    Mirrors at (your allocation ÷ their current equity) of their size. If they're much larger
                    than your allocation, trades can round down to nothing — Fixed $ avoids that.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Max slippage
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0.01}
                      max={20}
                      step="0.01"
                      value={maxSlippagePctInput}
                      onChange={(e) => setMaxSlippagePctInput(e.target.value)}
                      className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 pr-7 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-slate-500">%</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Max position ($)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={maxPositionUsdInput}
                    onChange={(e) => setMaxPositionUsdInput(e.target.value)}
                    className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
                  />
                </div>
              </div>
              <p className="-mt-2 text-[11px] text-slate-600">
                Max slippage caps how far past the visible price a mirrored order will chase to fill. Max
                position is a hard ceiling on this copy's notional in any one market — a trade that would push
                past it is skipped, not resized.
              </p>

              <p className="text-[11px] text-slate-600">
                Deposit is only requested if your subaccount needs it — if it's already funded, nothing is
                deposited.
              </p>

              {error && (
                <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2 text-[12px] text-[--color-down]">
                  {error}
                </div>
              )}

              <label className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-400">
                <input
                  type="checkbox"
                  checked={risksAcknowledged}
                  onChange={(e) => setRisksAcknowledged(e.target.checked)}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  I understand copying can lose money, fees can erode small/frequent trades, and past
                  performance isn't a promise of future results. (Full details on the{' '}
                  <span className="text-slate-300">Terms & risks</span> page in the sidebar.)
                </span>
              </label>

              <button
                onClick={() => {
                  const slip = Number(maxSlippagePctInput)
                  const pos = Number(maxPositionUsdInput)
                  if (!Number.isFinite(slip) || slip <= 0 || slip > 20) {
                    setError('Max slippage must be a number between 0 and 20%.')
                    return
                  }
                  if (!Number.isFinite(pos) || pos <= 0) {
                    setError('Max position must be a positive number.')
                    return
                  }
                  setError(null)
                  runSetup()
                }}
                disabled={!risksAcknowledged}
                className="w-full rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 py-2.5 text-[13px] font-semibold text-ink-950 disabled:opacity-40"
              >
                Set up to copy this trader
              </button>
            </div>
          )}

          {busy && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl border border-ink-700/60 bg-ink-850/50 px-4 py-4">
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-mint-500 border-t-transparent" />
                <span className="text-[13px] text-slate-300">{STEP_LABEL[step]}</span>
              </div>
              <p className="text-center text-[11px] text-slate-600">
                {step === 'verifying' || step === 'linking' || step === 'approving' || step === 'depositing'
                  ? 'Check your wallet extension for a prompt.'
                  : 'One moment…'}
              </p>
            </div>
          )}

          {step === 'needs-funds' && (
            <div className="space-y-4">
              <p className="text-center text-[13px] text-slate-300">
                This subaccount needs at least <strong>${MIN_USDT0} USDT0</strong> before a signer can be linked.
                Deposit directly below — two wallet prompts (approve, then deposit).
              </p>

              {walletBalance !== null && (
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-slate-500">Wallet balance</span>
                  <span className="tnum text-slate-300">{fromRaw(walletBalance).toFixed(2)} USDT0</span>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Amount to deposit
                </label>
                <input
                  type="number"
                  min={MIN_USDT0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-[14px] text-slate-200 outline-none focus:border-mint-500/50"
                />
              </div>

              <button
                onClick={onDeposit}
                className="w-full rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 py-2.5 text-[13px] font-semibold text-ink-950"
              >
                Deposit ${amount || '0'} USDT0
              </button>

              {error && (
                <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2 text-[12px] text-[--color-down]">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-3">
              <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2.5 text-[12.5px] text-[--color-down]">
                {error}
              </div>
              <button
                onClick={() => runSetup(account ?? undefined)}
                className="w-full rounded-lg border border-ink-600 py-2.5 text-[13px] font-medium text-slate-300 hover:border-slate-500"
              >
                Try again
              </button>
            </div>
          )}

          {step === 'done' && followerKey && (
            <div className="space-y-4">
              <div className="rounded-lg border border-mint-500/25 bg-mint-500/[0.08] px-4 py-3 text-[13px] text-mint-400">
                You're now copying {shortAddr(leader.address)}
                {mode === 'fixed' ? ` — $${fixedUsd} per trade` : ` — $${amount} allocated`}.
              </div>

              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-lg border border-ink-700/60 bg-ink-850/50 px-3 py-2">
                  <div className="text-slate-500">Max slippage</div>
                  <div className="tnum text-slate-200">{maxSlippagePctInput}%</div>
                </div>
                <div className="rounded-lg border border-ink-700/60 bg-ink-850/50 px-3 py-2">
                  <div className="text-slate-500">Max position</div>
                  <div className="tnum text-slate-200">${maxPositionUsdInput}</div>
                </div>
              </div>

              <div className="rounded-xl border border-ink-700/60 bg-ink-850/50 p-4">
                <p className="text-[12px] font-semibold text-slate-200">Nothing left to do</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
                  The signer was generated, linked, and handed straight to the mirror service — you never had
                  to see or save a key. It's watching this leader now and will mirror their trades automatically.
                </p>
                <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                  If your account ever runs out of margin to mirror a trade, this pauses itself automatically
                  rather than keep failing silently — you'll see why in{' '}
                  <span className="text-slate-300">My Copies</span>, where you can also manage or stop it
                  anytime.
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 py-2.5 text-[13px] font-semibold text-ink-950"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
