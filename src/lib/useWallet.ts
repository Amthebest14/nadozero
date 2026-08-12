import { useCallback, useState } from 'react'
import { connectWallet, isInkChain, verifyWalletPresence, walletErrorMessage } from './gateway'

/**
 * Single shared connection state for the whole app — the top-right widget
 * and the Account page both read and drive the same instance (passed down
 * from App), so connecting in one place is reflected everywhere else
 * immediately, like a normal wallet button.
 *
 * `verified` requires a real signature (see verifyWalletPresence) — connect
 * alone can be silent on some wallets, so it's never trusted by itself.
 */
export function useWallet() {
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const conn = await connectWallet()
      setAccount(conn.address)
      setChainId(conn.chainId)
      await verifyWalletPresence(conn.address)
      setVerified(true)
    } catch (e) {
      setVerified(false)
      setError(walletErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [])

  /** Re-run just the signature check — for recovering from a rejected/failed verify without reconnecting. */
  const reverify = useCallback(async () => {
    if (!account) return
    setBusy(true)
    setError(null)
    try {
      await verifyWalletPresence(account)
      setVerified(true)
    } catch (e) {
      setVerified(false)
      setError(walletErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [account])

  /** Clears local app state only — wallets don't expose a real EIP-1193 disconnect. */
  const disconnect = useCallback(() => {
    setAccount(null)
    setChainId(null)
    setVerified(false)
    setError(null)
  }, [])

  return {
    account,
    chainId,
    verified,
    busy,
    error,
    onWrongNetwork: chainId !== null && !isInkChain(chainId),
    connect,
    reverify,
    disconnect,
  }
}

export type WalletState = ReturnType<typeof useWallet>
