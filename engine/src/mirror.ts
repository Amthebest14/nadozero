/**
 * Single-pair CLI runner — watches ONE leader and mirrors into ONE follower,
 * for manual testing on your own machine. The actual mirroring logic lives
 * in mirror-core.ts, shared with server.ts (the real multi-tenant service).
 *
 * Usage:
 *   LEADER=0x...                          leader wallet to watch
 *   FOLLOWER_WALLET_ADDRESS=0x...         whose subaccount orders land in
 *   FOLLOWER_SIGNER_PRIVATE_KEY=0x...     from generate-signer / CopyModal's download
 *   FOLLOWER_MODE=proportional|fixed      default: proportional
 *   FOLLOWER_ALLOCATION_USD=50            required if mode=proportional
 *   FOLLOWER_FIXED_USD=1                  required if mode=fixed
 *   FOLLOWER_MAX_SLIPPAGE_PCT=0.005       default: 0.005 (0.5%)
 *   FOLLOWER_MAX_POSITION_USD=100         default: unlimited — set this for real testing
 *   npm run mirror
 */
import { defaultSubaccountOf, SUBSCRIPTIONS_WS, type FillEvent } from './nado-types.ts'
import { mirrorFill, type Mode, type MirrorCtx } from './mirror-core.ts'
import { DEFAULT_MAX_SLIPPAGE_PCT } from './db.ts'
import { computeRatio } from './sizing.ts'
import { fetchAccountEquity, fetchMarkets } from './market-data.ts'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

async function main() {
  const leaderAddress = process.env.LEADER
  const leaderSubaccountOverride = process.env.LEADER_SUBACCOUNT
  if (!leaderAddress && !leaderSubaccountOverride) {
    throw new Error('Set LEADER=0x... (or LEADER_SUBACCOUNT if not on the "default" subaccount)')
  }
  const followerWallet = requireEnv('FOLLOWER_WALLET_ADDRESS')
  const followerKey = requireEnv('FOLLOWER_SIGNER_PRIVATE_KEY') as `0x${string}`
  const mode = (process.env.FOLLOWER_MODE ?? 'proportional') as Mode
  if (mode !== 'proportional' && mode !== 'fixed') {
    throw new Error(`FOLLOWER_MODE must be "proportional" or "fixed", got "${mode}"`)
  }

  const leaderSubaccount = leaderSubaccountOverride ?? defaultSubaccountOf(leaderAddress!)
  const followerSubaccount = defaultSubaccountOf(followerWallet)

  if (leaderSubaccount.toLowerCase() === followerSubaccount.toLowerCase()) {
    throw new Error(
      'Leader and follower are the same subaccount — the engine would mirror its own fills in an infinite loop. Use two different accounts.',
    )
  }

  console.log('Loading market reference data...')
  const markets = await fetchMarkets()

  let ratio: number | null = null
  let fixedUsd: number | null = null

  if (mode === 'proportional') {
    const allocationUsd = Number(requireEnv('FOLLOWER_ALLOCATION_USD'))
    if (!Number.isFinite(allocationUsd) || allocationUsd <= 0) {
      throw new Error('FOLLOWER_ALLOCATION_USD must be a positive number')
    }
    console.log('Reading leader equity...')
    const leaderEquity = await fetchAccountEquity(leaderSubaccount)
    if (leaderEquity <= 0) {
      throw new Error(`Leader subaccount has non-positive equity ($${leaderEquity.toFixed(2)}) — refusing to compute a copy ratio`)
    }
    ratio = computeRatio(allocationUsd, leaderEquity)
    console.log(`\nMode:                 proportional`)
    console.log(`Leader equity:        $${leaderEquity.toFixed(2)}`)
    console.log(`Follower allocation:  $${allocationUsd.toFixed(2)}`)
    console.log(`Copy ratio:           ${ratio} (mirrors at ${(ratio * 100).toFixed(4)}% of leader's size)`)
  } else {
    fixedUsd = Number(requireEnv('FOLLOWER_FIXED_USD'))
    if (!Number.isFinite(fixedUsd) || fixedUsd <= 0) {
      throw new Error('FOLLOWER_FIXED_USD must be a positive number')
    }
    console.log(`\nMode:                 fixed`)
    console.log(`Fixed size per trade: $${fixedUsd.toFixed(2)} (same direction as leader, every fill)`)
  }

  console.log(`\nWatching leader:      ${leaderSubaccount}`)
  console.log(`Mirroring into:       ${followerSubaccount}\n`)

  const maxSlippagePct = process.env.FOLLOWER_MAX_SLIPPAGE_PCT
    ? Number(process.env.FOLLOWER_MAX_SLIPPAGE_PCT)
    : DEFAULT_MAX_SLIPPAGE_PCT
  const maxPositionUsd = process.env.FOLLOWER_MAX_POSITION_USD ? Number(process.env.FOLLOWER_MAX_POSITION_USD) : null
  console.log(`Max slippage:         ${(maxSlippagePct * 100).toFixed(2)}%`)
  console.log(`Max position cap:     ${maxPositionUsd === null ? 'none (be careful)' : `$${maxPositionUsd}`}`)

  const ctx: MirrorCtx = { markets, mode, ratio, fixedUsd, maxSlippagePct, maxPositionUsd, followerSubaccount, followerKey }
  const ws = new WebSocket(SUBSCRIPTIONS_WS)

  ws.addEventListener('open', () => {
    console.log('Connected. Subscribing to leader fill stream...\n')
    ws.send(JSON.stringify({ method: 'subscribe', stream: { type: 'fill', subaccount: leaderSubaccount, product_id: null }, id: 1 }))
  })

  ws.addEventListener('message', (ev) => {
    let msg: unknown
    try {
      msg = JSON.parse(ev.data.toString())
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object' || (msg as { type?: string }).type !== 'fill') return
    void mirrorFill(msg as FillEvent, ctx)
  })

  ws.addEventListener('close', (ev) => console.log(`\nConnection closed (code=${ev.code}). No auto-reconnect in this version.`))
  ws.addEventListener('error', (ev) => console.error('WebSocket error:', ev))
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})

process.on('SIGINT', () => {
  console.log('\nClosing...')
  process.exit(0)
})
