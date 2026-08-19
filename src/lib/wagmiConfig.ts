/**
 * Reown AppKit + wagmi setup — replaces the old hand-rolled window.ethereum
 * connection (kept for a while on purpose, see useWallet.ts's prior
 * history) specifically to add multi-wallet + real mobile support
 * (WalletConnect/QR), which window.ethereum alone can never provide on a
 * mobile browser with no injected extension.
 *
 * `appKit` (the framework-agnostic core instance `createAppKit` returns) is
 * exported alongside `wagmiConfig` because gateway.ts's connect/sign
 * functions are plain async functions, not React components — they need
 * the imperative core API (open the modal, watch account state), not the
 * `useAppKit()`/`useAccount()` React hooks that main.tsx's provider tree
 * enables for the rest of the app.
 */
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { ink } from 'viem/chains'

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string
if (!projectId) {
  console.error('[wagmi] VITE_REOWN_PROJECT_ID is not set — wallet connect will not work.')
}

const metadata = {
  name: 'NadoZero',
  description: "Copy Nado's best traders, automatically.",
  url: typeof window !== 'undefined' ? window.location.origin : 'https://nadozero.xyz',
  icons: ['https://nadozero.xyz/favicon.svg'],
}

/**
 * `ssr: true` despite this being a plain client-only Vite SPA, not a real
 * SSR framework — confirmed by reading @wagmi/core's hydrate.js directly.
 * With ssr:false, wagmi's reconnect-on-mount runs SYNCHRONOUSLY during the
 * very first render, before an injected wallet like MetaMask has announced
 * itself (EIP-6963 is inherently async) — so it reconnects to nothing and
 * silently gives up. The ssr:true path defers that same reconnect into a
 * useEffect (after the wallet's had a chance to announce) AND additionally
 * re-registers freshly-announced injected connectors first — that whole
 * step is skipped entirely when ssr is false. The one real downside is a
 * one-tick-later paint of "connected" on load, which is nothing next to
 * "never reconnects."
 */
const wagmiAdapter = new WagmiAdapter({
  networks: [ink],
  projectId,
  ssr: true,
})

/**
 * NadoZero only ever needs one thing from AppKit: connect a wallet. Every
 * one of these off-switches removes a real, separately-loaded UI surface
 * (swap, onramp, send/receive, activity feed, email/social login) that
 * otherwise ships as extra JS chunks on every page load, whether or not
 * anyone ever opens the modal — measured as 60+ chunks and ~4s added to
 * domContentLoaded on the deployed site before this was set, which visibly
 * delayed the leaderboard's own data queries starting. None of these
 * features exist anywhere in this app's UI, so there's no loss turning
 * them off — see DEFAULT_REMOTE_FEATURES_DISABLED in
 * @reown/appkit-controllers for the source of these exact keys.
 */
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks: [ink],
  projectId,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false,
    receive: false,
    send: false,
    swaps: false,
    onramp: false,
    legalCheckbox: false,
  },
})

export const wagmiConfig = wagmiAdapter.wagmiConfig
