/** Minimal, dependency-free helpers for subaccount/appendix encoding. Mirrors src/lib/nado.ts in the frontend. */

export const SUBSCRIPTIONS_WS = 'wss://gateway.prod.nado.xyz/v1/subscribe'
export const GATEWAY_WS = 'wss://gateway.prod.nado.xyz/v1/ws'

const DEFAULT_NAME_HEX = '64656661756c740000000000' // "default" padded to 12 bytes

export const defaultSubaccountOf = (address: string) => address.toLowerCase() + DEFAULT_NAME_HEX
export const addressOf = (subaccount: string) => '0x' + subaccount.slice(2, 42)

export function decodeAppendix(appendix: string) {
  const a = BigInt(appendix)
  return {
    builderId: Number((a >> 48n) & 0xffffn),
    builderFeeRate: Number((a >> 38n) & 0x3ffn),
    orderType: Number((a >> 9n) & 0x3n),
    reduceOnly: Boolean((a >> 11n) & 1n),
    isolated: Boolean((a >> 8n) & 1n),
  }
}

/** Order type values for the appendix's 2-bit order-type field. */
export const OrderType = { DEFAULT: 0, IOC: 1, FOK: 2, POST_ONLY: 3 } as const

/**
 * Encodes the order appendix (inverse of decodeAppendix). Reserved/trigger
 * bits default to 0 (NONE) — this engine never places trigger/TWAP orders.
 */
export function encodeAppendix(opts: {
  orderType: number
  reduceOnly?: boolean
  builderId?: number
  builderFeeRate?: number
  isolated?: boolean
  version?: number
}): bigint {
  const version = BigInt(opts.version ?? 1)
  const isolated = opts.isolated ? 1n : 0n
  const orderType = BigInt(opts.orderType)
  const reduceOnly = opts.reduceOnly ? 1n : 0n
  const builderFeeRate = BigInt(opts.builderFeeRate ?? 0)
  const builderId = BigInt(opts.builderId ?? 0)
  return (
    (builderId << 48n) |
    (builderFeeRate << 38n) |
    (reduceOnly << 11n) |
    (orderType << 9n) |
    (isolated << 8n) |
    version
  )
}

/**
 * Order nonce: top 44 bits = recv_time in ms (matching engine ignores the
 * order if it arrives after this), bottom 20 bits = random anti-collision.
 * Self-generated — no query needed, unlike the tx_nonce used for LinkSigner.
 */
export function buildOrderNonce(recvTimeMs: number, random20 = Math.floor(Math.random() * 2 ** 20)): bigint {
  return (BigInt(recvTimeMs) << 20n) | BigInt(random20)
}

/**
 * EIP712 verifyingContract for Place Order is NOT the endpoint address
 * (unlike every other execute) — it's the product id encoded as a 20-byte
 * address. Easy to get wrong the same way the missing-0x bug happened.
 */
export function productVerifyingContract(productId: number): `0x${string}` {
  return ('0x' + productId.toString(16).padStart(40, '0')) as `0x${string}`
}

const X18 = 1e18
export const fromX18 = (v: string) => Number(v) / X18

export interface FillEvent {
  type: 'fill'
  timestamp: string
  product_id: number
  subaccount: string
  order_digest: string
  appendix: string
  filled_qty: string
  remaining_qty: string
  original_qty: string
  price: string
  is_taker: boolean
  is_bid: boolean
  fee: string
  submission_idx: string
  id?: number
}
