import { useQuery } from '@tanstack/react-query'
import {
  aggregateTape,
  defaultSubaccountOf,
  estimateTimestamp,
  fetchIdxCalibration,
  fetchPortfolio,
  fetchSymbols,
  fetchTraderMatches,
  measureIdxPerHour,
  primarySubaccount,
  scanTape,
  summarisePortfolio,
  type IdxCalibration,
  type PortfolioSummary,
  type SymbolInfo,
  type TapeStats,
  type TraderRow,
} from './nado'
import { fetchNlpLockedBalances, fetchNlpPoolInfo, type NlpLockedBalances, type NlpPool } from './gateway'

/** How many 500-fill pages of the global tape to walk. 8 ≈ 4,000 fills. */
export const TAPE_PAGES = 8
/** How many top traders get enriched with full portfolio history. */
export const ENRICH_COUNT = 25

export function useTape(pages = TAPE_PAGES) {
  return useQuery<TapeStats>({
    queryKey: ['tape', pages],
    queryFn: async () => {
      const matches = await scanTape(pages)
      if (!matches.length) return aggregateTape(matches)

      // Calibrate: how much wall-clock time does this window of fills cover?
      let windowHours: number | null = null
      try {
        const perHour = await measureIdxPerHour(matches[0].submission_idx)
        if (perHour) {
          const span = Number(
            BigInt(matches[0].submission_idx) -
              BigInt(matches[matches.length - 1].submission_idx),
          )
          windowHours = span / perHour
        }
      } catch {
        /* calibration is a nice-to-have; the tape still stands without it */
      }
      return aggregateTape(matches, windowHours)
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}

export interface LeaderRow extends TraderRow {
  portfolio: PortfolioSummary | null
}

/**
 * Enrich the most active traders from the tape with their verified
 * portfolio history. Ranking happens in the view.
 */
export function useLeaderboard(tape: TapeStats | undefined) {
  const top = tape?.traders.slice(0, ENRICH_COUNT) ?? []
  const key = top.map((t) => t.address).join(',')

  return useQuery<LeaderRow[]>({
    queryKey: ['leaderboard', key],
    enabled: top.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        top.map(async (t): Promise<LeaderRow> => {
          const subaccount = primarySubaccount(t) ?? defaultSubaccountOf(t.address)
          try {
            const raw = await fetchPortfolio(subaccount)
            return { ...t, portfolio: summarisePortfolio(raw) }
          } catch {
            return { ...t, portfolio: null }
          }
        }),
      )
      return results
    },
  })
}

/**
 * Raw recent fills for the NadoTracker feed — separate query from useTape so
 * the feed can refresh on its own faster cadence without re-triggering the
 * leaderboard aggregation that hangs off the tape query.
 */
export function useWhaleTape(pages = 3) {
  return useQuery({
    queryKey: ['whale-tape', pages],
    queryFn: () => scanTape(pages),
    staleTime: 45_000,
    refetchInterval: 60_000,
  })
}

/** product_id -> symbol reference data. Rarely changes; cache generously. */
export function useSymbols() {
  return useQuery<Map<number, SymbolInfo>>({
    queryKey: ['symbols'],
    queryFn: fetchSymbols,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  })
}

/** A single trader's own recent trade history — for the "view past trades" drilldown. */
export function useTraderHistory(subaccount: string | null) {
  return useQuery({
    queryKey: ['trader-history', subaccount],
    enabled: !!subaccount,
    staleTime: 30_000,
    queryFn: () => fetchTraderMatches(subaccount!, 50),
  })
}

/**
 * One idx->time reference point, shared app-wide (any trade-history view
 * reuses the same calibration rather than each re-measuring it).
 */
export function useIdxCalibration() {
  return useQuery<IdxCalibration | null>({
    queryKey: ['idx-calibration'],
    queryFn: fetchIdxCalibration,
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
  })
}

export interface AccountPnlSince {
  netUsd: number
  fillCount: number
}

/**
 * Net (realized PnL - fees) across a subaccount's fills since a given time.
 * Honest caveat, worth keeping in mind wherever this is shown: if a wallet
 * runs more than one copy at once, they share one subaccount, so this
 * reflects the WHOLE account's activity since that point — not fills
 * cleanly attributable to just one copy. There's no way to attribute a raw
 * fill to "which copy caused it" when two copies could trade the same
 * market concurrently, so this is deliberately labeled "since started",
 * not "this copy's PnL", everywhere it's displayed.
 */
export function useAccountPnlSince(subaccount: string | null, sinceMs: number | null) {
  const { data: calibration } = useIdxCalibration()

  return useQuery<AccountPnlSince | null>({
    queryKey: ['account-pnl-since', subaccount, sinceMs],
    enabled: !!subaccount && !!sinceMs && !!calibration,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const matches = await fetchTraderMatches(subaccount!, 300)
      let netUsd = 0
      let fillCount = 0
      for (const m of matches) {
        const t = estimateTimestamp(m.submission_idx, calibration!)
        if (t.getTime() < sinceMs!) break // newest-first — once we're older than sinceMs, we're done
        netUsd += Number(m.realized_pnl) / 1e18 - Number(m.fee) / 1e18
        fillCount++
      }
      return { netUsd, fillCount }
    },
  })
}

export function useNlpPoolInfo() {
  return useQuery<NlpPool[]>({
    queryKey: ['nlp-pool-info'],
    queryFn: fetchNlpPoolInfo,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useNlpLockedBalances(subaccount: string | null) {
  return useQuery<NlpLockedBalances | null>({
    queryKey: ['nlp-locked-balances', subaccount],
    enabled: !!subaccount,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: () => fetchNlpLockedBalances(subaccount!),
  })
}

export interface LeaderFrequency {
  fillsPerHour: number
  sampleFills: number
  sampleHours: number
}

/**
 * How often a leader actually trades, measured directly rather than assumed —
 * built specifically to warn a follower before they pick a fixed-$ amount
 * too small for Nado's flat per-order fee. Reuses the same idx-calibration
 * trick as trade-history timestamps; no new machinery.
 */
export function useLeaderFrequency(subaccount: string | null) {
  const { data: calibration } = useIdxCalibration()

  return useQuery<LeaderFrequency | null>({
    queryKey: ['leader-frequency', subaccount],
    enabled: !!subaccount && !!calibration,
    staleTime: 60_000,
    queryFn: async () => {
      const matches = await fetchTraderMatches(subaccount!, 40)
      if (matches.length < 2 || !calibration) return null
      const newest = estimateTimestamp(matches[0].submission_idx, calibration)
      const oldest = estimateTimestamp(matches[matches.length - 1].submission_idx, calibration)
      const sampleHours = (newest.getTime() - oldest.getTime()) / 3_600_000
      if (sampleHours <= 0) return null
      return { fillsPerHour: matches.length / sampleHours, sampleFills: matches.length, sampleHours }
    },
  })
}
