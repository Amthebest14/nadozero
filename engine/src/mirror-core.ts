/**
 * The actual mirroring logic — react to one leader fill, size it, sign it,
 * place it. Shared by mirror.ts (single-pair CLI, for manual testing) and
 * server.ts (multi-tenant: many leaders, many followers, all at once).
 * Keeping this in one place means the CLI and the server can never silently
 * drift into different behavior.
 */
import { decodeAppendix, encodeAppendix, fromX18, OrderType, type FillEvent } from './nado-types.ts'
import { computeFixedMirrorSize, computeMirrorSize } from './sizing.ts'
import { fetchMarketPrice, fetchPosition, roundPriceX18ToTick, type MarketInfo } from './market-data.ts'
import { placeOrder } from './orders.ts'

/**
 * NadoZero's own Nado builder registration — approved 2026-09-13 (Builder ID
 * 5200, confirmed live by Nado's team). Before this existed every mirrored
 * order went out with builderId 0 (encodeAppendix's default when omitted),
 * meaning zero builder fees were ever captured, on any real trade, until
 * this constant was added. builderFeeRate is in 0.1bps units — 10 units =
 * 1bps — matching the 4bps rate submitted in the Builder Program application.
 */
const NADOZERO_BUILDER_ID = 5200
const NADOZERO_BUILDER_FEE_RATE = 40 // 4bps

export type Mode = 'proportional' | 'fixed'

export interface MirrorCtx {
  markets: Map<number, MarketInfo>
  mode: Mode
  /** Required if mode === 'proportional'. */
  ratio: number | null
  /** Required if mode === 'fixed'. */
  fixedUsd: number | null
  /** Fraction, e.g. 0.005 = 0.5%. */
  maxSlippagePct: number
  /** USD notional ceiling on this copy's resulting position — null = no cap. */
  maxPositionUsd: number | null
  followerSubaccount: string
  followerKey: `0x${string}`
  /** Optional — lets callers tag log lines when multiple followers are running at once. */
  label?: string
}

/**
 * Nado's codes for "this order would leave the account underfunded" — see
 * https://docs.nado.xyz/developer-resources/api/errors.md. Distinct from
 * sizing errors (2003, 2094) which are a market-minimum problem, not a
 * money problem, and don't warrant pausing the copy.
 */
export const INSUFFICIENT_HEALTH_CODES = new Set([2006, 2036])

export type MirrorOutcome =
  | { kind: 'skipped'; reason: string }
  | { kind: 'placed'; digest?: string }
  | { kind: 'failed'; error?: string; errorCode?: number }

export async function mirrorFill(fill: FillEvent, ctx: MirrorCtx): Promise<MirrorOutcome> {
  const tag = ctx.label ? `[${ctx.label}]` : ''
  const market = ctx.markets.get(fill.product_id)
  const leaderQtyMagnitude = fromX18(fill.filled_qty)
  const leaderQty = fill.is_bid ? leaderQtyMagnitude : -leaderQtyMagnitude

  console.log(`${tag}[leader] ${market?.symbol ?? `product#${fill.product_id}`} ${fill.is_bid ? 'BUY' : 'SELL'} ${leaderQtyMagnitude}`)

  if (!market) {
    const reason = `unknown product ${fill.product_id} (symbols not loaded for it)`
    console.log(`${tag}  -> skipped: ${reason}`)
    return { kind: 'skipped', reason }
  }

  let bid: number, ask: number
  try {
    ;({ bid, ask } = await fetchMarketPrice(fill.product_id))
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.log(`${tag}  -> ERROR fetching price: ${error}`)
    return { kind: 'failed', error }
  }
  const midPrice = (bid + ask) / 2

  const sized =
    ctx.mode === 'fixed'
      ? computeFixedMirrorSize({ leaderFillQty: leaderQty, fixedUsd: ctx.fixedUsd!, price: midPrice, market })
      : computeMirrorSize({ leaderFillQty: leaderQty, ratio: ctx.ratio!, market })

  if (sized.qty === null) {
    console.log(`${tag}  -> skipped: ${sized.reason}`)
    return { kind: 'skipped', reason: sized.reason! }
  }

  if (ctx.maxPositionUsd !== null) {
    try {
      const currentPosition = await fetchPosition(ctx.followerSubaccount, fill.product_id)
      const resultingNotional = Math.abs(currentPosition + sized.qty) * midPrice
      if (resultingNotional > ctx.maxPositionUsd) {
        const reason = `resulting position ~$${resultingNotional.toFixed(2)} would exceed your cap of $${ctx.maxPositionUsd}`
        console.log(`${tag}  -> skipped: ${reason}`)
        return { kind: 'skipped', reason }
      }
    } catch (e) {
      const error = `couldn't verify position cap: ${e instanceof Error ? e.message : String(e)}`
      console.log(`${tag}  -> skipped: ${error}`)
      return { kind: 'skipped', reason: error }
    }
  }

  try {
    const rawPrice = sized.qty > 0 ? ask * (1 + ctx.maxSlippagePct) : bid * (1 - ctx.maxSlippagePct)
    // Convert to x18 once, then do the tick-rounding in pure integer math — see
    // roundPriceX18ToTick's doc comment for the float bug this specifically avoids.
    const rawPriceX18 = BigInt(Math.round(rawPrice * 1e18))
    const priceX18 = roundPriceX18ToTick(rawPriceX18, market.priceIncrementX18)
    const price = Number(priceX18) / 1e18

    console.log(`${tag}  -> mirroring: ${sized.qty > 0 ? 'BUY' : 'SELL'} ${Math.abs(sized.qty)} ${market.symbol} @ ~${price} (IOC, max slippage ${(ctx.maxSlippagePct * 100).toFixed(2)}%)`)

    const result = await placeOrder({
      productId: fill.product_id,
      sender: ctx.followerSubaccount,
      priceX18,
      amount: BigInt(Math.round(sized.qty * 1e18)),
      appendix: encodeAppendix({
        orderType: OrderType.IOC,
        builderId: NADOZERO_BUILDER_ID,
        builderFeeRate: NADOZERO_BUILDER_FEE_RATE,
      }),
      followerPrivateKey: ctx.followerKey,
    })

    if (result.status === 'success') {
      console.log(`${tag}  -> OK. digest=${result.digest?.slice(0, 10)}…`)
      return { kind: 'placed', digest: result.digest }
    } else {
      console.log(`${tag}  -> FAILED: ${result.error} (code ${result.errorCode})`)
      return { kind: 'failed', error: result.error, errorCode: result.errorCode }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.log(`${tag}  -> ERROR: ${error}`)
    return { kind: 'failed', error }
  }
}

// Re-exported so callers building a ctx don't need a second import for appendix decoding.
export { decodeAppendix }
