import { useEffect, useState } from 'react'
import { Logo } from './Logo'

export type Tab = 'leaders' | 'tracker' | 'builders' | 'copies' | 'portfolio' | 'earn' | 'start' | 'terms'

const NavIcon = {
  leaders: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M17 3H7a2 2 0 0 0-2 2v4a7 7 0 0 0 14 0V5a2 2 0 0 0-2-2Z" />
      <path d="M5 6H3a2 2 0 0 0 0 4h2M19 6h2a2 2 0 0 1 0 4h-2" />
    </svg>
  ),
  tracker: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  builders: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
    </svg>
  ),
  copies: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  portfolio: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  ),
  earn: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  start: () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  ),
} as const

const NAV: { key: keyof typeof NavIcon; label: string }[] = [
  { key: 'leaders', label: 'Trader leaderboard' },
  { key: 'tracker', label: 'NadoTracker' },
  { key: 'builders', label: 'Builder intel' },
  { key: 'copies', label: 'My copies' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'earn', label: 'Earn' },
  { key: 'start', label: 'Account' },
]

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export function Sidebar({
  tab,
  onChange,
  isFetching,
  isPending,
}: {
  tab: Tab
  onChange: (t: Tab) => void
  isFetching: boolean
  isPending: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  // close on Escape, and whenever the page navigates (tab change) — matches the modal pattern used elsewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (t: Tab) => {
    onChange(t)
    setMobileOpen(false)
  }

  return (
    <>
      {/* mobile-only top bar — the sidebar itself is off-canvas below lg */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-700/50 bg-ink-950/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-ink-800/60"
        >
          <MenuIcon />
        </button>
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-ink-900">
            <Logo size={17} />
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-slate-50">
            Nado<span className="text-mint-400">Zero</span>
          </span>
        </div>
      </div>

      {/* backdrop, mobile only, while the drawer is open */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-60 shrink-0 flex-col border-r border-ink-700/50 bg-ink-950/95 backdrop-blur-xl transition-transform duration-200 lg:sticky lg:inset-y-auto lg:left-auto lg:top-0 lg:z-auto lg:translate-x-0 lg:bg-ink-950/60 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink-900 shadow-[0_0_20px_-4px_rgba(62,224,176,0.5)]">
              <Logo size={20} />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-slate-50">
              Nado<span className="text-mint-400">Zero</span>
            </span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-colors hover:bg-ink-800/60 hover:text-slate-300 lg:hidden"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="px-5 text-xs leading-relaxed text-slate-500">Zero effort. Zero experience. Just copy.</p>

        <nav className="mt-5 flex-1 space-y-0.5 px-3">
          {NAV.map(({ key, label }) => {
            const Icon = NavIcon[key]
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => go(key)}
                className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'text-ink-950' : 'text-slate-400 hover:bg-ink-800/60 hover:text-slate-200'
                }`}
              >
                {active && (
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-b from-mint-300 to-mint-500" />
                )}
                <span className="relative">
                  <Icon />
                </span>
                <span className="relative">{label}</span>
              </button>
            )
          })}
        </nav>

        <div className="mx-3 my-3 border-t border-ink-800/70" />

        <div className="space-y-0.5 px-3 pb-4">
          <button
            onClick={() => go('terms')}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === 'terms' ? 'bg-ink-800/60 text-slate-200' : 'text-slate-500 hover:bg-ink-800/60 hover:text-slate-300'
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v4M12 17h.01" />
              <circle cx="12" cy="12" r="10" />
            </svg>
            Terms & risks
          </button>
          <a
            href="https://docs.nado.xyz"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-ink-800/60 hover:text-slate-300"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            </svg>
            Nado docs
          </a>

          <div className="mt-2 flex items-center gap-2 rounded-lg border border-ink-700/60 bg-ink-900/60 px-3 py-2">
            <span className={`h-1.5 w-1.5 rounded-full ${isFetching ? 'live-dot bg-mint-400' : 'bg-mint-600'}`} />
            <span className="text-xs text-slate-500">
              {isPending ? 'reading mainnet…' : isFetching ? 'refreshing' : 'live · Ink mainnet'}
            </span>
          </div>
        </div>
      </aside>
    </>
  )
}
