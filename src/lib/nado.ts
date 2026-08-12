/**
 * Nado public API client — Archive (indexer) reads only.
 * No auth, no keys. Everything here is public on-chain/off-chain data.
 * Docs: https://docs.nado.xyz/developer-resources/api
 */

export const ARCHIVE = 'https://archive.prod.nado.xyz/v1'
export const GATEWAY = 'https://gateway.prod.nado.xyz/v1'

export interface SymbolInfo {
  type: 'spot' | 'perp'
  product_id: number
  symbol: string
  trading_status: string
}

/** product_id -> ticker (e.g. "BTC-PERP"). Static-ish reference data, safe to cache long. */
export async function fetchSymbols(): Promise<Map<number, SymbolInfo>> {
  const res = await fetch(`${GATEWAY}/symbols`)
  if (!res.ok) throw new Error(`Symbols ${res.status}`)
  const list: SymbolInfo[] = await res.json()
  return new Map(list.map((s) => [s.product_id, s]))
}

const X18 = 1e18

/** Parse an x18 fixed-point decimal string into a JS number. */
export const fromX18 = (v: string | number): number => Number(v) / X18

async function archive<T>(body: unknown): Promise<T> {
  const res = await fetch(ARCHIVE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Archive ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------- appendix

/**
 * Order appendix bit layout (128-bit):
 * value(127..64) | builder(63..48) | builder_fee_rate(47..38) | reserved(37..14)
 * | trigger(13..12) | reduce_only(11) | order_type(10..9) | isolated(8) | version(7..0)
 */
export function decodeAppendix(appendix: string) {
  const a = BigInt(appendix)
  return {
    builderId: Number((a >> 48n) & 0xffffn),
    /** fee rate in 0.1bps units — 10 units = 1bps */
    builderFeeRate: Number((a >> 38n) & 0x3ffn),
    orderType: Number((a >> 9n) & 0x3n),
    reduceOnly: Boolean((a >> 11n) & 1n),
  }
}

/** 0.1bps units -> bps */
export const rateToBps = (units: number) => units / 10

// ------------------------------------------------------------ subaccounts

const DEFAULT_NAME_HEX = '64656661756c740000000000' // "default" padded to 12 bytes

export const addressOf = (subaccount: string) => '0x' + subaccount.slice(2, 42)

export const defaultSubaccountOf = (address: string) =>
  address.toLowerCase() + DEFAULT_NAME_HEX

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// ----------------------------------------------------------------- matches

interface ProductBalance {
  perp?: { product_id: number }
  spot?: { product_id: number }
}

export interface Match {
  digest: string
  order: {
    sender: string
    priceX18: string
    amount: string
    appendix: string
  }
  base_filled: string
  quote_filled: string
  fee: string
  submission_idx: string
  isolated: boolean
  is_taker: boolean
  realized_pnl: string
  builder_fee: string
  pre_balance: { base?: ProductBalance } | null
  post_balance: { base?: ProductBalance } | null
}

/** Which product a fill was on — nested in the balance snapshot, not a flat field. */
export function productIdOfMatch(m: Match): number {
  const base = (m.post_balance ?? m.pre_balance)?.base
  return base?.perp?.product_id ?? base?.spot?.product_id ?? 0
}

/** One page of the global fill tape, newest first. */
export async function fetchMatches(opts: { limit?: number; idx?: string } = {}) {
  const { matches } = await archive<{ matches: Match[] }>({
    matches: {
      limit: opts.limit ?? 500,
      ...(opts.idx ? { idx: opts.idx } : {}),
    },
  })
  return matches
}

/** Newest submission_idx at or before `timeSec` — used to time-calibrate the tape. */
export async function fetchIdxAt(timeSec: number): Promise<string | null> {
  const { matches } = await archive<{ matches: Match[] }>({
    matches: { limit: 1, max_time: String(Math.floor(timeSec)) },
  })
  return matches?.[0]?.submission_idx ?? null
}

/**
 * How many submission indices Nado burns per hour, measured over the last 24h.
 * Lets us turn "volume in this tape window" into an honest daily run-rate.
 */
export async function measureIdxPerHour(newestIdx: string): Promise<number | null> {
  const dayAgo = await fetchIdxAt(Date.now() / 1000 - 86_400)
  if (!dayAgo) return null
  const span = Number(BigInt(newestIdx) - BigInt(dayAgo))
  return span > 0 ? span / 24 : null
}

/** A trader's own recent trade history, newest first. */
export async function fetchTraderMatches(subaccount: string, limit = 50) {
  const { matches } = await archive<{ matches: Match[] }>({
    matches: { subaccounts: [subaccount], limit },
  })
  return matches
}

export interface IdxCalibration {
  referenceIdx: bigint
  referenceTimeMs: number
  idxPerHour: number
}

/** One reference point (idx + real time + rate) good for estimating any nearby idx's clock time. */
export async function fetchIdxCalibration(): Promise<IdxCalibration | null> {
  const [newest] = await fetchMatches({ limit: 1 })
  if (!newest) return null
  const perHour = await measureIdxPerHour(newest.submission_idx)
  if (!perHour) return null
  return { referenceIdx: BigInt(newest.submission_idx), referenceTimeMs: Date.now(), idxPerHour: perHour }
}

/** Estimated wall-clock time for a match's submission_idx — approximate, not exact. */
export function estimateTimestamp(idx: string, cal: IdxCalibration): Date {
  const idxAgo = Number(cal.referenceIdx - BigInt(idx))
  const hoursAgo = idxAgo / cal.idxPerHour
  return new Date(cal.referenceTimeMs - hoursAgo * 3_600_000)
}

export function timeAgo(date: Date): string {
  const diffSec = (Date.now() - date.getTime()) / 1000
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86_400)}d ago`
}

/** Walk backwards through the tape for `pages` pages. */
export async function scanTape(
  pages: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Match[]> {
  const all: Match[] = []
  let idx: string | undefined
  for (let p = 0; p < pages; p++) {
    const page = await fetchMatches({ limit: 500, idx })
    if (!page.length) break
    all.push(...page)
    idx = (BigInt(page[page.length - 1].submission_idx) - 1n).toString()
    onProgress?.(p + 1, pages)
  }
  return all
}

// --------------------------------------------------------------- portfolio

export type PortfolioPeriod =
  | 'day' | 'week' | 'month' | 'allTime'
  | 'perpDay' | 'perpWeek' | 'perpMonth' | 'perpAllTime'

export interface PortfolioHistory {
  accountValueHistory: [string, string][]
  pnlHistory: [string, string][]
  volumeHistory: [string, string][]
  tradeSizeHistory: [string, string][]
  marketCountHistory: [string, string][]
}

export type PortfolioResponse = [PortfolioPeriod, PortfolioHistory][]

export async function fetchPortfolio(subaccount: string) {
  const raw = await archive<PortfolioResponse>({ portfolio: { subaccount } })
  return new Map(raw)
}

const lastVal = (series?: [string, string][]) =>
  series && series.length ? Number(series[series.length - 1][1]) : 0

/** Flatten the 8-series portfolio payload into leaderboard-shaped numbers. */
export function summarisePortfolio(m: Map<PortfolioPeriod, PortfolioHistory>) {
  const day = m.get('day')
  const week = m.get('week')
  const month = m.get('month')
  const all = m.get('allTime')
  return {
    accountValue: lastVal(all?.accountValueHistory) || lastVal(week?.accountValueHistory),
    pnlDay: lastVal(day?.pnlHistory),
    pnlWeek: lastVal(week?.pnlHistory),
    pnlMonth: lastVal(month?.pnlHistory),
    pnlAll: lastVal(all?.pnlHistory),
    volWeek: lastVal(week?.volumeHistory),
    volAll: lastVal(all?.volumeHistory),
    avgTradeSize: lastVal(week?.tradeSizeHistory),
    markets: lastVal(week?.marketCountHistory),
    /** account-value curve for the sparkline */
    curve: (week?.accountValueHistory ?? []).map(([, v]) => Number(v)),
    curveAll: (all?.accountValueHistory ?? []).map(([, v]) => Number(v)),
  }
}

export type PortfolioSummary = ReturnType<typeof summarisePortfolio>

// ------------------------------------------------------------- aggregation

export interface TraderRow {
  address: string
  volume: number
  fills: number
  realizedPnl: number
  feesPaid: number
  takerFills: number
  builders: Set<number>
  /**
   * Cross-margin subaccounts this wallet actually traded from, by volume.
   * Traders don't always use "default", and portfolio rejects isolated
   * subaccounts — so we ask the tape instead of guessing.
   */
  crossSubaccounts: Map<string, number>
}

/** The cross subaccount a wallet trades the most from, if the tape saw one. */
export function primarySubaccount(t: TraderRow): string | null {
  let best: string | null = null
  let bestVol = -1
  for (const [sa, vol] of t.crossSubaccounts) {
    if (vol > bestVol) {
      bestVol = vol
      best = sa
    }
  }
  return best
}

export interface BuilderRow {
  builderId: number
  volume: number
  fills: number
  traders: Set<string>
  feeRates: Set<number>
  /** builder fee actually recorded on these fills, in USDT0 */
  earned: number
}

export interface TapeStats {
  traders: TraderRow[]
  builders: BuilderRow[]
  totalVolume: number
  totalFills: number
  routedVolume: number
  uniqueTraders: number
  /** wall-clock hours the scanned window covers, if calibration succeeded */
  windowHours: number | null
}

/** Fold the raw fill tape into trader + builder league tables. */
export function aggregateTape(matches: Match[], windowHours: number | null = null): TapeStats {
  const traders = new Map<string, TraderRow>()
  const builders = new Map<number, BuilderRow>()
  let totalVolume = 0
  let routedVolume = 0

  for (const m of matches) {
    const quote = Math.abs(fromX18(m.quote_filled))
    const address = addressOf(m.order.sender)
    const { builderId, builderFeeRate } = decodeAppendix(m.order.appendix)

    totalVolume += quote

    let t = traders.get(address)
    if (!t) {
      t = {
        address,
        volume: 0,
        fills: 0,
        realizedPnl: 0,
        feesPaid: 0,
        takerFills: 0,
        builders: new Set(),
        crossSubaccounts: new Map(),
      }
      traders.set(address, t)
    }
    t.volume += quote
    t.fills += 1
    t.realizedPnl += fromX18(m.realized_pnl)
    t.feesPaid += fromX18(m.fee)
    if (m.is_taker) t.takerFills += 1
    if (builderId) t.builders.add(builderId)
    if (!m.isolated) {
      t.crossSubaccounts.set(
        m.order.sender,
        (t.crossSubaccounts.get(m.order.sender) ?? 0) + quote,
      )
    }

    let b = builders.get(builderId)
    if (!b) {
      b = {
        builderId,
        volume: 0,
        fills: 0,
        traders: new Set(),
        feeRates: new Set(),
        earned: 0,
      }
      builders.set(builderId, b)
    }
    b.volume += quote
    b.fills += 1
    b.traders.add(address)
    b.earned += fromX18(m.builder_fee)
    if (builderId) {
      b.feeRates.add(builderFeeRate)
      routedVolume += quote
    }
  }

  return {
    traders: [...traders.values()].sort((a, b) => b.volume - a.volume),
    builders: [...builders.values()].sort((a, b) => b.volume - a.volume),
    totalVolume,
    totalFills: matches.length,
    routedVolume,
    uniqueTraders: traders.size,
    windowHours,
  }
}
