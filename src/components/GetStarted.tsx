import { useEffect, useState } from 'react'
import {
  fetchLinkedSigner,
  isAddress,
  linkSigner,
  looksLikePrivateKey,
  signerBytes32Of,
  subaccountOf,
  walletErrorMessage,
  ZERO_SIGNER_BYTES32,
} from '../lib/gateway'
import type { WalletState } from '../lib/useWallet'
import { shortAddr } from '../lib/nado'
import { Avatar, Panel, Pill } from './ui'

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'success'; msg: string } | { kind: 'error'; msg: string }

/**
 * Account status + management. NOT the onboarding flow anymore — that's
 * "Copy this trader" on the leaderboard (CopyModal), which generates and
 * links a signer automatically in one guided sequence. This page is for
 * checking your current linked signer or revoking it, plus a manual/advanced
 * fallback for linking a specific address by hand (mainly useful for testing
 * — real followers should never need it).
 *
 * `wallet` is shared with the top-right connect widget (App owns the single
 * instance) so connecting from either place is reflected in both.
 */
export function GetStarted({ wallet }: { wallet: WalletState }) {
  const { account, verified, onWrongNetwork } = wallet
  const [currentSigner, setCurrentSigner] = useState<string | null | 'loading'>('loading')
  const [signerInput, setSignerInput] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => {
    if (!account || !verified) return
    let cancelled = false
    setCurrentSigner('loading')
    fetchLinkedSigner(subaccountOf(account))
      .then((s) => !cancelled && setCurrentSigner(s))
      .catch(() => !cancelled && setCurrentSigner(null))
    return () => {
      cancelled = true
    }
  }, [account, verified])

  async function refreshSigner() {
    if (!account) return
    setCurrentSigner('loading')
    try {
      setCurrentSigner(await fetchLinkedSigner(subaccountOf(account)))
    } catch {
      setCurrentSigner(null)
    }
  }

  async function onLink() {
    const val = signerInput.trim()
    if (looksLikePrivateKey(val)) {
      setStatus({ kind: 'error', msg: "That's a private key, not an address — stop. Paste the address only." })
      return
    }
    if (!isAddress(val)) {
      setStatus({ kind: 'error', msg: 'Not a valid address (expected 0x + 40 hex characters).' })
      return
    }
    setStatus({ kind: 'busy' })
    try {
      const result = await linkSigner(account!, signerBytes32Of(val))
      if (result.status === 'success') {
        setStatus({ kind: 'success', msg: 'Signer linked.' })
        await refreshSigner()
      } else {
        setStatus({ kind: 'error', msg: result.error ?? 'Link failed.' })
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: walletErrorMessage(e) })
    }
  }

  async function onRevoke() {
    if (!confirm('Revoke the current linked signer? Only your main wallet will be able to trade afterwards.')) return
    setStatus({ kind: 'busy' })
    try {
      const result = await linkSigner(account!, ZERO_SIGNER_BYTES32)
      if (result.status === 'success') {
        setStatus({ kind: 'success', msg: 'Signer revoked.' })
        await refreshSigner()
      } else {
        setStatus({ kind: 'error', msg: result.error ?? 'Revoke failed.' })
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: walletErrorMessage(e) })
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-mint-500/25 bg-mint-500/[0.06] px-4 py-3 text-sm leading-relaxed text-slate-300">
        Want to copy a trader? Head to the <strong className="text-mint-400">leaderboard</strong> and click{' '}
        <strong className="text-mint-400">"Copy this trader"</strong> — deposit, key setup, and linking all
        happen there in one guided flow. This page is just for checking your wallet's current status.
      </div>

      <Panel
        title="Wallet & signer status"
        desc="Every signature request here goes through your wallet extension — your private key never leaves it, and never passes through NadoZero."
      >
        <div className="space-y-4 p-6">
          {!account ? (
            <button
              onClick={() => wallet.connect()}
              disabled={wallet.busy}
              className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
            >
              {wallet.busy ? 'Connecting…' : 'Connect wallet'}
            </button>
          ) : !verified ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-ink-700/60 bg-ink-850/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar seed={account} size={28} />
                  <span className="tnum text-sm text-slate-200">{shortAddr(account)}</span>
                </div>
                <Pill tone="down">unverified</Pill>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">
                Wallet connections can be silent on some extensions, so an address alone doesn't prove a real
                person is actually here. Nothing about your account is shown until you approve one signature —
                it moves no funds and grants no trading permission, it only proves presence.
              </p>
              <button
                onClick={() => wallet.reverify()}
                disabled={wallet.busy}
                className="rounded-lg bg-gradient-to-b from-mint-300 to-mint-500 px-5 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
              >
                {wallet.busy ? 'Waiting for signature…' : 'Verify wallet'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-ink-700/60 bg-ink-850/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar seed={account} size={28} />
                  <span className="tnum text-sm text-slate-200">{shortAddr(account)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Pill tone="up">verified</Pill>
                  <Pill tone={onWrongNetwork ? 'down' : 'up'}>
                    {onWrongNetwork ? 'wrong network — switch to Ink' : 'Ink mainnet'}
                  </Pill>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Current linked signer</span>
                <span className="tnum text-slate-300">
                  {currentSigner === 'loading' ? 'checking…' : (currentSigner ?? 'none set (main wallet only)')}
                </span>
              </div>

              {currentSigner && currentSigner !== 'loading' && (
                <button
                  onClick={onRevoke}
                  disabled={status.kind === 'busy'}
                  className="w-full rounded-lg border border-ink-600 px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-slate-500 disabled:opacity-50"
                >
                  Revoke linked signer
                </button>
              )}

              <details className="group rounded-lg border border-ink-700/60">
                <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-300">
                  Advanced — link a specific address manually
                </summary>
                <div className="space-y-3 border-t border-ink-700/60 px-4 py-3.5">
                  <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.06] px-3 py-2.5 text-xs leading-relaxed text-slate-400">
                    <strong className="text-[--color-down]">Only paste an ADDRESS, never a private key.</strong>{' '}
                    64 hex characters means it's a key — stop if you see that.
                  </div>
                  <input
                    value={signerInput}
                    onChange={(e) => setSignerInput(e.target.value)}
                    placeholder="0x…"
                    spellCheck={false}
                    className="tnum w-full rounded-lg border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-mint-500/50"
                  />
                  <button
                    onClick={onLink}
                    disabled={status.kind === 'busy' || !signerInput}
                    className="w-full rounded-lg border border-ink-600 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 disabled:opacity-50"
                  >
                    {status.kind === 'busy' ? 'Waiting for signature…' : 'Link this address'}
                  </button>
                </div>
              </details>
            </div>
          )}

          {wallet.error && (
            <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2 text-sm text-[--color-down]">
              {wallet.error}
            </div>
          )}
          {status.kind === 'success' && (
            <div className="rounded-lg border border-mint-500/25 bg-mint-500/[0.08] px-3 py-2 text-sm text-mint-400">
              {status.msg}
            </div>
          )}
          {status.kind === 'error' && (
            <div className="rounded-lg border border-[--color-down]/25 bg-[--color-down]/[0.08] px-3 py-2 text-sm text-[--color-down]">
              {status.msg}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Good to know">
        <div className="space-y-3 p-6 text-sm leading-relaxed text-slate-400">
          <p>
            A linked signer can trade freely, but per Nado's own docs, withdrawals always return to your main
            wallet address — it can never send funds anywhere else.
          </p>
          <p>
            Nado requires ≥5 USDT0 in a subaccount before any signer can be linked to it. The "Copy this trader"
            flow handles that deposit for you automatically if needed.
          </p>
        </div>
      </Panel>
    </div>
  )
}
