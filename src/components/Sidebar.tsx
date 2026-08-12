import { useEffect, useState } from 'react'
import { Logo } from './Logo'

export type Tab = 'leaders' | 'tracker' | 'builders' | 'copies' | 'portfolio' | 'earn' | 'start' | 'terms'

const COLLAPSE_KEY = 'nz-sidebar-collapsed'

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

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
    >
      <path d="M11 19l-7-7 7-7M20 19l-7-7 7-7" />
    </svg>
  )
}

/** A label that shrinks/fades out on collapse instead of just vanishing — keeps the toggle feeling like motion, not a jump cut. */
function CollapsingLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`relative overflow-hidden whitespace-nowrap transition-all duration-200 ${
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[160px] opacity-100'
      }`}
    >
      {children}
    </span>
  )
}

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
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1')

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-ink-700/50 bg-ink-950/60 backdrop-blur-xl transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[76px]' : 'w-60'
      }`}
    >
      <div className={`pb-5 pt-6 transition-[padding] duration-200 ${collapsed ? 'px-3' : 'px-5'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-900 shadow-[0_0_20px_-4px_rgba(62,224,176,0.5)]">
              <Logo size={20} />
            </div>
            <CollapsingLabel collapsed={collapsed}>
              <span className="font-display text-[16px] font-semibold tracking-tight text-slate-50">
                Nado<span className="text-mint-400">Zero</span>
              </span>
            </CollapsingLabel>
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-600 transition-colors hover:bg-ink-800/60 hover:text-slate-300"
          >
            <CollapseIcon collapsed={collapsed} />
          </button>
        </div>
        <CollapsingLabel collapsed={collapsed}>
          <p className="mt-2 w-[200px] text-[11px] leading-relaxed text-slate-500">
            Zero effort. Zero experience. Just copy.
          </p>
        </CollapsingLabel>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ key, label }) => {
          const Icon = NavIcon[key]
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              title={collapsed ? label : undefined}
              className={`relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${active ? 'text-ink-950' : 'text-slate-400 hover:bg-ink-800/60 hover:text-slate-200'}`}
            >
              {active && (
                <span className="absolute inset-0 rounded-lg bg-gradient-to-b from-mint-300 to-mint-500" />
              )}
              <span className="relative shrink-0">
                <Icon />
              </span>
              <span className="relative">
                <CollapsingLabel collapsed={collapsed}>{label}</CollapsingLabel>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mx-3 my-3 border-t border-ink-800/70" />

      <div className={`space-y-0.5 pb-4 transition-[padding] duration-200 ${collapsed ? 'px-3' : 'px-3'}`}>
        <button
          onClick={() => onChange('terms')}
          title={collapsed ? 'Terms & risks' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
            collapsed ? 'justify-center' : ''
          } ${tab === 'terms' ? 'bg-ink-800/60 text-slate-200' : 'text-slate-500 hover:bg-ink-800/60 hover:text-slate-300'}`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M12 9v4M12 17h.01" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <CollapsingLabel collapsed={collapsed}>Terms & risks</CollapsingLabel>
        </button>
        <a
          href="https://docs.nado.xyz"
          target="_blank"
          rel="noreferrer"
          title={collapsed ? 'Nado docs' : undefined}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:bg-ink-800/60 hover:text-slate-300 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
          </svg>
          <CollapsingLabel collapsed={collapsed}>Nado docs</CollapsingLabel>
        </a>

        <div
          title={collapsed ? (isPending ? 'reading mainnet…' : isFetching ? 'refreshing' : 'live · Ink mainnet') : undefined}
          className={`mt-2 flex items-center gap-2 rounded-lg border border-ink-700/60 bg-ink-900/60 px-3 py-2 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isFetching ? 'live-dot bg-mint-400' : 'bg-mint-600'}`} />
          <CollapsingLabel collapsed={collapsed}>
            <span className="text-[11px] text-slate-500">
              {isPending ? 'reading mainnet…' : isFetching ? 'refreshing' : 'live · Ink mainnet'}
            </span>
          </CollapsingLabel>
        </div>
      </div>
    </aside>
  )
}
