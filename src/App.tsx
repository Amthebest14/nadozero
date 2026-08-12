import { useState } from 'react'
import { Leaderboard } from './components/Leaderboard'
import { Tracker } from './components/Tracker'
import { BuilderIntel } from './components/BuilderIntel'
import { GetStarted } from './components/GetStarted'
import { MyCopies } from './components/MyCopies'
import { Portfolio } from './components/Portfolio'
import { ProfileModal } from './components/ProfileModal'
import { Earn } from './components/Earn'
import { Terms } from './components/Terms'
import { Sidebar, type Tab } from './components/Sidebar'
import { Hero } from './components/Hero'
import { WalletButton } from './components/WalletButton'
import { StatTile } from './components/ui'
import { useTape } from './lib/hooks'
import { useWallet } from './lib/useWallet'
import { usd } from './lib/format'
import { defaultSubaccountOf } from './lib/nado'
import { useCountUp } from './lib/useCountUp'

const PAGE_META: Record<Tab, { title: string; desc: string }> = {
  leaders: {
    title: 'Trader leaderboard',
    desc: 'Verified, on-chain performance — nothing here is self-reported.',
  },
  tracker: {
    title: 'NadoTracker',
    desc: 'The biggest orders hitting Nado, live off the public tape — spot a whale, check their record, copy them in one tap.',
  },
  builders: {
    title: 'Builder intel',
    desc: "Who's routing volume on Nado, and how much of the market is still unclaimed.",
  },
  copies: {
    title: 'My copies',
    desc: 'The traders you\'re copying, and what the mirror service is doing on your behalf.',
  },
  portfolio: {
    title: 'Portfolio',
    desc: 'Your own positions, balances and PnL — read straight from the sequencer, shareable as a card.',
  },
  earn: {
    title: 'Earn',
    desc: "Nado's own liquidity vault — deposit USDT0, earn a share of its market-making yield. Not a copy trade, not run by NadoZero.",
  },
  start: {
    title: 'Account',
    desc: "Your wallet's connection and linked-signer status — copying itself happens from the leaderboard.",
  },
  terms: {
    title: 'Terms & risks',
    desc: 'What NadoZero actually holds, what a linked signer can do, and the real risks of copying — worth reading before you deposit anything.',
  },
}

const Icon = {
  Pulse: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-8 4 16 2-8h6" />
    </svg>
  ),
  Users: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Route: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" />
      <path d="M9 19h8a4 4 0 0 0 4-4V9M6 16V9a4 4 0 0 1 4-4h2" />
    </svg>
  ),
  Spark: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
    </svg>
  ),
}

/** ?trader=0x… deep link — lets a PnL card or copied profile link open straight onto that trader. */
function traderFromUrl(): string | null {
  const t = new URLSearchParams(window.location.search).get('trader')
  return t && /^0x[0-9a-fA-F]{40}$/.test(t) ? t.toLowerCase() : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('leaders')
  const [profileTarget, setProfileTarget] = useState<string | null>(traderFromUrl)
  const wallet = useWallet()
  const { data: tape, isPending, isFetching } = useTape()

  const closeProfile = () => {
    setProfileTarget(null)
    // drop the ?trader= param so refresh/back doesn't reopen a closed profile
    window.history.replaceState(null, '', window.location.pathname)
  }

  const routedShareRaw =
    tape && tape.totalVolume ? (tape.routedVolume / tape.totalVolume) * 100 : undefined

  // Same tween-between-refreshes pattern as Hero — independent RAF loops, negligible cost.
  const volume = useCountUp(tape?.totalVolume)
  const traders = useCountUp(tape?.uniqueTraders)
  const routedShare = useCountUp(routedShareRaw)

  const meta = PAGE_META[tab]

  return (
    <div className="bg-scene min-h-screen bg-ink-950">
      <div className="aurora" />
      <div className="bg-grain" />
      <div className="bg-vignette" />

      <div className="relative flex">
        <Sidebar tab={tab} onChange={setTab} isFetching={isFetching} isPending={isPending} />

        <main className="min-w-0 flex-1 px-8 pb-20 pt-8 lg:px-10">
          <div className="mx-auto max-w-[1080px]">
            {/* ---------------------------------------------------- wallet corner */}
            <div className="mb-6 flex justify-end">
              <WalletButton wallet={wallet} />
            </div>

            {tab === 'leaders' ? (
              <Hero
                tape={tape}
                onExplore={() =>
                  document.getElementById('main-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              />
            ) : (
              /* -------------------------------------------------------- page header */
              <div className="rise-in mb-7">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-50">
                  {meta.title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{meta.desc}</p>
              </div>
            )}

            {/* ---------------------------------------------------------- stat grid */}
            <div id="main-panel" className="mb-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                icon={<Icon.Pulse />}
                label="Volume scanned"
                value={volume !== undefined ? usd(volume, { compact: true }) : '—'}
                sub={tape?.windowHours ? `last ${tape.windowHours.toFixed(1)} hours of fills` : `${tape?.totalFills ?? 0} fills`}
              />
              <StatTile
                icon={<Icon.Users />}
                label="Active traders"
                value={traders !== undefined ? Math.round(traders).toLocaleString() : '—'}
                sub="unique wallets in the window"
              />
              <StatTile
                icon={<Icon.Route />}
                label="Routed by builders"
                value={routedShare !== undefined ? `${routedShare.toFixed(1)}%` : '—'}
                sub={`${tape?.builders.filter((b) => b.builderId).length ?? 0} builder codes seen`}
              />
              <StatTile
                accent
                icon={<Icon.Spark />}
                label="Unrouted opportunity"
                value={routedShare !== undefined ? `${(100 - routedShare).toFixed(1)}%` : '—'}
                sub="volume no builder has captured"
              />
            </div>

            <div className="rise-in" key={tab}>
              {tab === 'leaders' && <Leaderboard tape={tape} />}
              {tab === 'tracker' && <Tracker />}
              {tab === 'builders' && <BuilderIntel tape={tape} />}
              {tab === 'copies' && <MyCopies wallet={wallet} />}
              {tab === 'portfolio' && <Portfolio wallet={wallet} />}
              {tab === 'earn' && <Earn wallet={wallet} />}
              {tab === 'start' && <GetStarted wallet={wallet} />}
              {tab === 'terms' && <Terms />}
            </div>

            {/* ----------------------------------------------------------- footer */}
            <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink-800/60 pt-6 text-xs text-slate-600">
              <p>Leaderboard and builder data are read-only. Copying is real — a linked signer trades your subaccount.</p>
              <p>
                <a href="https://docs.nado.xyz" target="_blank" rel="noreferrer" className="text-slate-500 underline-offset-2 hover:text-mint-400 hover:underline">
                  Nado docs
                </a>
              </p>
            </footer>
          </div>
        </main>
      </div>

      {profileTarget && (
        <ProfileModal
          address={profileTarget}
          subaccount={defaultSubaccountOf(profileTarget)}
          onClose={closeProfile}
        />
      )}
    </div>
  )
}
