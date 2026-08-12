import { useState } from 'react'
import { shortAddr } from '../lib/nado'
import type { WalletState } from '../lib/useWallet'
import { Avatar } from './ui'

const WalletIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
)

/**
 * Lives where "Connect Wallet" always lives — top-right, on every page.
 * Standard wallet-button behavior only: click to connect, click again to
 * disconnect. It doesn't navigate anywhere; the Account page reads the same
 * shared `wallet` state, so both stay in sync automatically.
 */
export function WalletButton({ wallet }: { wallet: WalletState }) {
  const [confirming, setConfirming] = useState(false)

  if (wallet.account && wallet.verified) {
    return confirming ? (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            wallet.disconnect()
            setConfirming(false)
          }}
          className="rounded-full border border-[--color-down]/30 bg-[--color-down]/[0.1] px-3 py-1.5 text-[12.5px] font-medium text-[--color-down] hover:bg-[--color-down]/[0.18]"
        >
          Disconnect
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-full border border-ink-700/70 px-3 py-1.5 text-[12.5px] text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
    ) : (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 rounded-full border border-ink-700/70 bg-ink-900/80 py-1 pl-1.5 pr-3.5 text-[12.5px] font-medium text-slate-300 transition-colors hover:border-ink-600"
        title="Click to disconnect"
      >
        <Avatar seed={wallet.account} size={22} />
        <span className="tnum">{shortAddr(wallet.account)}</span>
      </button>
    )
  }

  return (
    <button
      onClick={() => wallet.connect()}
      disabled={wallet.busy}
      className="flex items-center gap-2 rounded-full border border-mint-500/30 bg-mint-500/[0.08] py-1.5 pl-3 pr-4 text-[12.5px] font-medium text-mint-400 transition-colors hover:bg-mint-500/[0.16] disabled:opacity-50"
    >
      <WalletIcon />
      {wallet.busy ? 'Connecting…' : 'Connect wallet'}
    </button>
  )
}
