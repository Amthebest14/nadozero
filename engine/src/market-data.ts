/** Live reference data the mirror loop needs: symbol/size constraints and current book prices. */
import type { MarketConstraints } from './sizing.ts'

const GATEWAY_REST = 'https://gateway.prod.nado.xyz/v1'

async function query<T>(body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_REST}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

interface RawSymbol {
  product_id: number
  symbol: string
  price_increment_x18: string
  size_increment: string
  min_size: string
  trading_status: string
}

export interface MarketInfo extends MarketConstraints {
  symbol: string
  priceIncrement: number
  /** Raw x18 integer form of priceIncrement — needed for exact (float-free) tick rounding, see roundPriceX18ToTick. */
  priceIncrementX18: bigint
}

/** product_id -> market info, including the size/price constraints sizing.ts needs. */
export async function fetchMarkets(): Promise<Map<number, MarketInfo>> {
  const res = await fetch(`${GATEWAY_REST}/symbols`)
  const list: RawSymbol[] = await res.json()
  return new Map(
    list.map((s) => [
      s.product_id,
      {
        symbol: s.symbol,
        sizeIncrement: Number(s.size_increment) / 1e18,
        // NOT s.min_size: it returned the identical raw value (1e20, "100 BTC")
        // on both BTC-PERP and an unrelated spot market — verified against
        // real fills as low as 0.0025 BTC, so it's a stale/default field, not
        // an enforced minimum. One size_increment is the trustworthy floor;
        // if a market genuinely rejects for being too small, place_order's
        // own response says so and we log it, rather than pre-guessing wrong.
        minSize: Number(s.size_increment) / 1e18,
        priceIncrement: Number(s.price_increment_x18) / 1e18,
        priceIncrementX18: BigInt(s.price_increment_x18),
      },
    ]),
  )
}

/** Live best bid/ask for one product — used to price a marketable IOC order. */
export async function fetchMarketPrice(productId: number): Promise<{ bid: number; ask: number }> {
  const res = await query<{ data: { bid_x18: string; ask_x18: string } }>({
    type: 'market_price',
    product_id: productId,
  })
  return { bid: Number(res.data.bid_x18) / 1e18, ask: Number(res.data.ask_x18) / 1e18 }
}

/**
 * Account equity from subaccount_info's unweighted health (assets minus
 * liabilities, unweighted) — the risk-weighted healths[0]/[1] are for margin
 * requirements, not a true equity figure.
 */
export async function fetchAccountEquity(subaccount: string): Promise<number> {
  const res = await query<{ data: { exists: boolean; healths: { health: string }[] } }>({
    type: 'subaccount_info',
    subaccount,
  })
  if (!res.data.exists) return 0
  return Number(res.data.healths[2].health) / 1e18
}

export interface AccountExposure {
  /** Unweighted equity (assets - liabilities) — same figure fetchAccountEquity returns, bundled here to save a call. */
  equity: number
  /** productId -> signed position size (base units). */
  positions: Map<number, number>
  /** productId -> oracle price — needed to value positions in markets other than the one being traded. */
  prices: Map<number, number>
}

/**
 * One subaccount_info call carrying everything mirror-core's per-market AND
 * account-wide caps need — equity, every open position, and every product's
 * oracle price. Used instead of two separate fetches (one for "current
 * position in this market", one for "total exposure everywhere") since both
 * caps can be active on the same copy and this runs on every leader fill.
 */
export async function fetchAccountExposure(subaccount: string): Promise<AccountExposure> {
  const res = await query<{
    data: {
      exists: boolean
      healths: { health: string }[]
      perp_balances?: { product_id: number; balance: { amount: string } }[]
      perp_products?: { product_id: number; oracle_price_x18: string }[]
    }
  }>({ type: 'subaccount_info', subaccount })
  if (!res.data.exists) return { equity: 0, positions: new Map(), prices: new Map() }
  return {
    equity: Number(res.data.healths[2].health) / 1e18,
    positions: new Map((res.data.perp_balances ?? []).map((b) => [b.product_id, Number(b.balance.amount) / 1e18])),
    prices: new Map((res.data.perp_products ?? []).map((p) => [p.product_id, Number(p.oracle_price_x18) / 1e18])),
  }
}

/** Sum of |position| * price across every open market — the follower's total notional exposure right now. */
export function totalNotional(exposure: AccountExposure): number {
  let sum = 0
  for (const [productId, amount] of exposure.positions) {
    sum += Math.abs(amount) * (exposure.prices.get(productId) ?? 0)
  }
  return sum
}

export function roundToTick(price: number, tick: number): number {
  if (tick <= 0) return price
  return Math.round(price / tick) * tick
}

/**
 * Rounds a raw x18 price to the nearest exact multiple of tickX18, using
 * only integer arithmetic. Nado's real-world failure mode this fixes:
 * `Math.round(price / tick) * tick` in plain floats — e.g. 1332.1 isn't
 * exactly representable in binary, so the float round-trip through *1e18
 * lands a few units off a true multiple (seen live: price ...000131072
 * instead of ...000000000, rejected with code 2000, InvalidPriceIncrement).
 * This function can never produce that class of bug — the result is
 * mathematically guaranteed divisible by tickX18, not just usually so.
 */
export function roundPriceX18ToTick(priceX18: bigint, tickX18: bigint): bigint {
  if (tickX18 <= 0n) return priceX18
  const remainder = ((priceX18 % tickX18) + tickX18) % tickX18 // always non-negative
  const half = tickX18 / 2n
  const roundedDown = priceX18 - remainder
  return remainder >= half ? roundedDown + tickX18 : roundedDown
}
