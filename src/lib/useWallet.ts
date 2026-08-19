import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { isInkChain, verifyWalletPresence, walletErrorMessage } from './gateway'

/**
 * Single shared connection state for the whole app — the top-right widget
 * and the Account page both read and drive the same instance (passed down
 * from App), so connecting in one place is reflected everywhere else
 * immediately, like a normal wallet button.
 *
 * Built on wagmi's `useAccount` (reactive — updates for injected AND
 * WalletConnect/mobile connections alike) rather than a one-shot
 * window.ethereum call, so this hook itself doesn't drive the connect flow
 * directly; it reacts to wagmi's state and layers the same forced-signature
 * verification on top every time a new address appears.
 *
 * `verified` requires a real signature (see verifyWalletPresence) — connect
 * alone can be silent on some wallets, so it's never trusted by itself.
 */
export function useWallet() {
  const { address, chainId, isConnected } = useAccount()
  const { open } = useAppKit()
  const { disconnectAsync } = useDisconnect()

  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Which address we've already verified (or are currently verifying) for — avoids re-prompting on every re-render. */
  const verifiedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!isConnected || !address) {
      verifiedFor.current = null
      setVerified(false)
      return
    }
    if (verifiedFor.current === address) return

    verifiedFor.current = address
    setBusy(true)
    setError(null)
    verifyWalletPresence(address)
      .then(() => setVerified(true))
      .catch((e) => {
        setVerified(false)
        setError(walletErrorMessage(e))
        verifiedFor.current = null // allow retrying via reverify()
      })
      .finally(() => setBusy(false))
  }, [isConnected, address])

  /** Opens the wallet-picker modal. Verification runs automatically (above) once wagmi reports a connected address. */
  const connect = useCallback(() => {
    setError(null)
    void open()
  }, [open])

  /** Re-runs just the signature check — for recovering from a rejected/failed verify without reconnecting. */
  const reverify = useCallback(async () => {
    if (!address) return
    setBusy(true)
    setError(null)
    try {
      await verifyWalletPresence(address)
      setVerified(true)
      verifiedFor.current = address
    } catch (e) {
      setVerified(false)
      setError(walletErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [address])

  /** Clears wagmi's connection too — unlike the old window.ethereum flow, a WalletConnect session has a real disconnect. */
  const disconnect = useCallback(() => {
    setVerified(false)
    setError(null)
    verifiedFor.current = null
    void disconnectAsync()
  }, [disconnectAsync])

  const chainIdHex = chainId !== undefined ? `0x${chainId.toString(16)}` : null

  return {
    account: address ?? null,
    chainId: chainIdHex,
    verified,
    busy,
    error,
    onWrongNetwork: chainIdHex !== null && !isInkChain(chainIdHex),
    connect,
    reverify,
    disconnect,
  }
}

export type WalletState = ReturnType<typeof useWallet>
