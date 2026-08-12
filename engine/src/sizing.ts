/**
 * Pure sizing math for mirroring a leader's fills into a follower's account.
 * No network calls, no keys — safe to test against real historical data.
 *
 * Model: fixed ratio, locked in at setup time.
 *   ratio = follower's allocated USD / leader's account equity (USD) at setup
 * Every subsequent leader fill is mirrored at `leaderFillQty * ratio`, same
 * direction, same market. A fixed ratio (rather than recomputing per trade)
 * keeps opens and closes consistent with each other — recomputing would let
 * a position opened at one ratio get closed at a different one, drifting
 * the follower's position out of sync with the leader's over time.
 *
 * Known simplification: uses plain floats, not the x18 fixed-point integers
 * the rest of Nado's API uses. Fine for small pocket-change testing; a
 * production version should redo this in BigInt to avoid float drift at scale.
 */

export interface MarketConstraints {
  /** Smallest tradable size step for this market. */
  sizeIncrement: number
  /** Minimum order size for this market. */
  minSize: number
}

export interface MirrorInput {
  /** Leader's fill size, signed: positive = buy, negative = sell. */
  leaderFillQty: number
  /** follower's allocated USD / leader's equity USD at setup time. */
  ratio: number
  market: MarketConstraints
}

export interface MirrorResult {
  /** Signed follower order size, rounded to the market's increment. Null if it rounds below the minimum. */
  qty: number | null
  reason?: string
}

/** Rounds toward zero to the nearest increment — never oversizes relative to the ratio. */
function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value
  const sign = Math.sign(value)
  const steps = Math.floor(Math.abs(value) / increment)
  return sign * steps * increment
}

/**
 * Alternative to the ratio model: every leader fill mirrors as the SAME
 * dollar amount, in the same direction, regardless of how big the leader's
 * account or trade is. Decouples follower size from leader size entirely —
 * the right choice when a small account is copying a much larger one, where
 * the ratio model would round every trade down to dust (see mirror.ts).
 */
export interface FixedSizeInput {
  /** Leader's fill, signed — only the sign (direction) is used. */
  leaderFillQty: number
  fixedUsd: number
  /** Current price to convert the fixed USD amount into a base-asset quantity. */
  price: number
  market: MarketConstraints
}

export function computeFixedMirrorSize({ leaderFillQty, fixedUsd, price, market }: FixedSizeInput): MirrorResult {
  if (leaderFillQty === 0) return { qty: null, reason: 'leader fill was zero' }
  if (price <= 0) return { qty: null, reason: 'invalid price' }

  const direction = Math.sign(leaderFillQty)
  const rounded = roundToIncrement(direction * (fixedUsd / price), market.sizeIncrement)

  if (Math.abs(rounded) < market.minSize) {
    return {
      qty: null,
      reason: `$${fixedUsd} at price ${price} rounds to ${Math.abs(rounded)}, below market minimum ${market.minSize}`,
    }
  }
  return { qty: rounded }
}

export function computeMirrorSize({ leaderFillQty, ratio, market }: MirrorInput): MirrorResult {
  if (leaderFillQty === 0) return { qty: null, reason: 'leader fill was zero' }

  const raw = leaderFillQty * ratio
  const rounded = roundToIncrement(raw, market.sizeIncrement)

  if (Math.abs(rounded) < market.minSize) {
    return {
      qty: null,
      reason: `sized qty ${Math.abs(rounded)} is below market minimum ${market.minSize}`,
    }
  }
  return { qty: rounded }
}

/** ratio = how much of the leader's equity the follower's allocation represents. */
export function computeRatio(followerAllocatedUsd: number, leaderEquityUsd: number): number {
  if (leaderEquityUsd <= 0) {
    throw new Error('leader equity must be positive to compute a copy ratio')
  }
  if (followerAllocatedUsd <= 0) {
    throw new Error('follower allocation must be positive')
  }
  return followerAllocatedUsd / leaderEquityUsd
}
