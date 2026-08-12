/**
 * Order signing + placement — the engine's own version of what the browser
 * flow does with window.ethereum, except here we hold the follower's raw
 * private key directly (that's the whole point of engine/.env.local) and
 * sign with viem's account object instead of a wallet extension.
 */
import { privateKeyToAccount } from 'viem/accounts'
import { buildOrderNonce, productVerifyingContract } from './nado-types.ts'

const GATEWAY_REST = 'https://gateway.prod.nado.xyz/v1'
export const INK_CHAIN_ID = 57073

/** Far-future sentinel matching Nado's own docs example — fine for IOC, which resolves instantly anyway. */
const NO_EXPIRATION = 4294967295n

export interface PlaceOrderParams {
  productId: number
  /** Follower's subaccount, bytes32 hex (address + subaccount name). */
  sender: string
  priceX18: bigint
  /** Signed: positive = buy, negative = sell. */
  amount: bigint
  appendix: bigint
  followerPrivateKey: `0x${string}`
  expiration?: bigint
}

export interface PlaceOrderResult {
  status: 'success' | 'failure'
  digest?: string
  error?: string
  errorCode?: number
}

export interface SignedOrder {
  sender: string
  priceX18: bigint
  amount: bigint
  expiration: bigint
  nonce: bigint
  appendix: bigint
  signature: `0x${string}`
}

/** Builds and signs an order — no network call. Independently testable with a throwaway key. */
export async function signOrder(params: PlaceOrderParams): Promise<SignedOrder> {
  const { productId, sender, priceX18, amount, appendix, followerPrivateKey } = params
  const expiration = params.expiration ?? NO_EXPIRATION
  const nonce = buildOrderNonce(Date.now() + 30_000) // 30s tolerance for submission latency

  const account = privateKeyToAccount(followerPrivateKey)

  const signature = await account.signTypedData({
    domain: {
      name: 'Nado',
      version: '0.0.1',
      chainId: INK_CHAIN_ID,
      verifyingContract: productVerifyingContract(productId),
    },
    types: {
      Order: [
        { name: 'sender', type: 'bytes32' },
        { name: 'priceX18', type: 'int128' },
        { name: 'amount', type: 'int128' },
        { name: 'expiration', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'appendix', type: 'uint128' },
      ],
    },
    primaryType: 'Order',
    message: { sender: sender as `0x${string}`, priceX18, amount, expiration, nonce, appendix },
  })

  return { sender, priceX18, amount, expiration, nonce, appendix, signature }
}

export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const { sender, priceX18, amount, appendix, expiration, nonce, signature } = await signOrder(params)

  const res = await fetch(`${GATEWAY_REST}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      place_order: {
        product_id: params.productId,
        order: {
          sender,
          priceX18: priceX18.toString(),
          amount: amount.toString(),
          expiration: expiration.toString(),
          nonce: nonce.toString(),
          appendix: appendix.toString(),
        },
        signature,
      },
    }),
  })

  const json = (await res.json()) as {
    status: 'success' | 'failure'
    data?: { digest: string }
    error?: string
    error_code?: number
  }

  return {
    status: json.status,
    digest: json.data?.digest,
    error: json.error,
    errorCode: json.error_code,
  }
}
