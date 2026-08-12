/**
 * Nado Gateway client — the only part of this app that talks to a wallet.
 * Kept separate from lib/nado.ts (pure reads, no keys) on purpose.
 *
 * Two different kinds of key touch this file, and they're handled very
 * differently:
 *  - The user's own main wallet: NEVER handled directly. Every signature
 *    request goes through window.ethereum, so the key never leaves the
 *    wallet extension.
 *  - A fresh follower signer key: generated right here, in-browser, purely
 *    client-side (generateFollowerSigner). It's disposable and only useful
 *    for a small linked subaccount, but it IS a real private key in memory
 *    briefly — it is never sent over the network, never logged, and the
 *    UI using it must make the user save it before it's gone.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, createWalletClient, custom, http, parseUnits } from 'viem'
import { ink } from 'viem/chains'

export const GATEWAY = 'https://gateway.prod.nado.xyz/v1'
export const INK_CHAIN_ID_HEX = '0xdef1' // 57073, Ink mainnet
export const INK_CHAIN_ID = 57073

/**
 * Wallets are inconsistent about hex casing/padding for eth_chainId
 * ('0xdef1' vs '0xDEF1' vs '0x0def1', etc.) — a strict string compare
 * against INK_CHAIN_ID_HEX produced false "wrong network" warnings on
 * wallets that already were on Ink. Compare numerically instead.
 */
export const isInkChain = (chainId: string) => {
  try {
    return parseInt(chainId, 16) === INK_CHAIN_ID
  } catch {
    return false
  }
}

const DEFAULT_NAME_HEX = '64656661756c740000000000' // "default", padded to 12 bytes

export const subaccountOf = (address: string) => address.toLowerCase() + DEFAULT_NAME_HEX

/**
 * bytes32 values in EIP712 typed data MUST be 0x-prefixed — MetaMask's
 * parser hard-rejects bare hex ("Expected a bytes-like value") before even
 * showing the user a popup. Keep the 0x.
 */
export const signerBytes32Of = (address: string) =>
  '0x' + address.toLowerCase().replace('0x', '') + '0'.repeat(24)

/** The zero signer (revokes linking) — same 0x rule applies. */
export const ZERO_SIGNER_BYTES32 = '0x' + '0'.repeat(64)

/**
 * Wallet RPC rejections are plain {code, message} objects, not Error
 * instances — String(e) on them renders "[object Object]". Always surface
 * errors through this instead.
 */
export function walletErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return String(e)
}

export const looksLikePrivateKey = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v.trim())
export const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim())

/** A fresh, disposable signer keypair — generated locally, never transmitted. */
export function generateFollowerSigner() {
  const privateKey = generatePrivateKey()
  const address = privateKeyToAccount(privateKey).address
  return { privateKey, address }
}

async function query<T>(body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<T>
}

export async function fetchContracts() {
  const res = await query<{ data: { chain_id: string; endpoint_addr: string } }>({ type: 'contracts' })
  return res.data
}

export async function fetchNonces(address: string) {
  const res = await query<{ data: { tx_nonce: number; order_nonce: number } }>({
    type: 'nonces',
    address,
  })
  return res.data
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export async function fetchLinkedSigner(subaccount: string): Promise<string | null> {
  const res = await query<{ data: { linked_signer: string } }>({ type: 'linked_signer', subaccount })
  const signer = res?.data?.linked_signer
  return !signer || signer.toLowerCase() === ZERO_ADDR ? null : signer
}

/**
 * Live USDT0 balance of a Nado subaccount, straight from the sequencer's own
 * state — NOT the Archive indexer, which lags fresh deposits by however long
 * indexing takes. This is what "is this subaccount funded right now" must
 * use; the portfolio/history endpoints are for analytics, not this check.
 */
export async function fetchSubaccountUsdt0Balance(subaccount: string): Promise<bigint> {
  const res = await query<{
    data: { exists: boolean; spot_balances: { product_id: number; balance: { amount: string } }[] }
  }>({ type: 'subaccount_info', subaccount })
  if (!res?.data?.exists) return 0n
  const usdt0 = res.data.spot_balances.find((b) => b.product_id === 0)
  return usdt0 ? BigInt(usdt0.balance.amount) : 0n
}

// ---------------------------------------------------------------- positions

export interface PerpPosition {
  productId: number
  /** signed base amount — negative = short */
  amount: number
  oraclePrice: number
  notional: number
  unrealizedPnl: number
}

export interface SpotHolding {
  productId: number
  amount: number
  valueUsd: number
}

export interface AccountSnapshot {
  exists: boolean
  /** unweighted assets - liabilities, same healths[2] tier the rest of the app uses */
  accountValue: number
  perps: PerpPosition[]
  spots: SpotHolding[]
}

const x18 = (v: string) => Number(v) / 1e18

/**
 * Open positions, balances and equity in ONE gateway call — subaccount_info
 * also carries every product's oracle price and funding state, so no separate
 * price query is needed. Perp uPnL = amount * oracle + v_quote, minus the
 * funding accrued since the position was last touched (v_quote is only
 * settled up to last_cumulative_funding).
 */
export async function fetchAccountSnapshot(subaccount: string): Promise<AccountSnapshot> {
  const res = await query<{
    data: {
      exists: boolean
      healths: { assets: string; liabilities: string }[]
      spot_balances: { product_id: number; balance: { amount: string } }[]
      perp_balances: {
        product_id: number
        balance: { amount: string; v_quote_balance: string; last_cumulative_funding_x18: string }
      }[]
      spot_products: { product_id: number; oracle_price_x18: string }[]
      perp_products: {
        product_id: number
        oracle_price_x18: string
        state: { cumulative_funding_long_x18: string }
      }[]
    }
  }>({ type: 'subaccount_info', subaccount })

  const d = res?.data
  if (!d?.exists) return { exists: false, accountValue: 0, perps: [], spots: [] }

  const perpProducts = new Map(d.perp_products.map((p) => [p.product_id, p]))
  const spotPrices = new Map(d.spot_products.map((p) => [p.product_id, x18(p.oracle_price_x18)]))

  const perps: PerpPosition[] = d.perp_balances
    .filter((b) => b.balance.amount !== '0')
    .map((b) => {
      const p = perpProducts.get(b.product_id)
      const amount = x18(b.balance.amount)
      const oraclePrice = p ? x18(p.oracle_price_x18) : 0
      const fundingOwed = p
        ? amount * (x18(p.state.cumulative_funding_long_x18) - x18(b.balance.last_cumulative_funding_x18))
        : 0
      return {
        productId: b.product_id,
        amount,
        oraclePrice,
        notional: Math.abs(amount) * oraclePrice,
        unrealizedPnl: amount * oraclePrice + x18(b.balance.v_quote_balance) - fundingOwed,
      }
    })
    .sort((a, b) => b.notional - a.notional)

  const spots: SpotHolding[] = d.spot_balances
    .filter((b) => b.balance.amount !== '0')
    .map((b) => {
      const amount = x18(b.balance.amount)
      return { productId: b.product_id, amount, valueUsd: amount * (spotPrices.get(b.product_id) ?? 0) }
    })
    .sort((a, b) => b.valueUsd - a.valueUsd)

  const h = d.healths[2]
  return { exists: true, accountValue: h ? x18(h.assets) - x18(h.liabilities) : 0, perps, spots }
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    }
  }
}

function requireWallet() {
  if (!window.ethereum) throw new Error('No wallet extension detected (install MetaMask, Rabby, or similar).')
  return window.ethereum
}

export async function connectWallet(): Promise<{ address: string; chainId: string }> {
  const eth = requireWallet()
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
  const chainId = (await eth.request({ method: 'eth_chainId' })) as string
  return { address: accounts[0], chainId }
}

/**
 * Some wallets skip the popup for eth_requestAccounts if an address was
 * ever authorized before, so "connected" alone doesn't prove a live human
 * is present with this real wallet, right now. personal_sign has no such
 * fast path — every wallet always prompts for it. We use that prompt as
 * the actual proof of a genuine, non-silent connection before showing
 * anything sensitive. The signature itself isn't submitted anywhere; the
 * act of the user approving the popup is the point.
 */
export async function verifyWalletPresence(account: string): Promise<void> {
  const eth = requireWallet()
  const message =
    `Verify wallet control for NadoZero\n\n` +
    `Address: ${account}\n` +
    `Time: ${new Date().toISOString()}\n\n` +
    `This signature moves no funds and grants no trading permission. ` +
    `It only proves a real wallet is present and approving, right now.`
  await eth.request({ method: 'personal_sign', params: [message, account] })
}

/**
 * Signs and submits a LinkSigner execute. `signerBytes32` should be the
 * ZERO signer bytes32 to revoke, or signerBytes32Of(address) to link.
 * Always signed by the connected wallet — never by a raw private key.
 */
export async function linkSigner(account: string, signerBytes32: string) {
  const eth = requireWallet()
  const [contracts, nonces] = await Promise.all([fetchContracts(), fetchNonces(account)])
  const sender = subaccountOf(account)

  const typedData = {
    domain: {
      name: 'Nado',
      version: '0.0.1',
      chainId: parseInt(contracts.chain_id, 10),
      verifyingContract: contracts.endpoint_addr,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      LinkSigner: [
        { name: 'sender', type: 'bytes32' },
        { name: 'signer', type: 'bytes32' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'LinkSigner',
    message: { sender, signer: signerBytes32, nonce: String(nonces.tx_nonce) },
  }

  const signature = (await eth.request({
    method: 'eth_signTypedData_v4',
    params: [account, JSON.stringify(typedData)],
  })) as string

  const res = await fetch(`${GATEWAY}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      link_signer: { tx: { sender, signer: signerBytes32, nonce: String(nonces.tx_nonce) }, signature },
    }),
  })
  return res.json() as Promise<{ status: 'success' | 'failure'; error?: string }>
}

// ------------------------------------------------------------- depositing
//
// Everything below moves real funds. Nothing here is guessed: the token
// address and decimals were independently verified with direct eth_call
// requests against the live Ink RPC (not just read from docs), and the
// depositCollateral signature matches Nado's documented Endpoint ABI
// exactly. Approvals are scoped to the exact amount being deposited, never
// unlimited, to keep the blast radius of a compromised approval minimal.

/** USDT0 on Ink. Verified on-chain: decimals() == 6 (immutable once deployed, cannot drift). */
export const USDT0_DECIMALS = 6

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const ENDPOINT_ABI = [
  {
    name: 'depositCollateral',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'subaccountName', type: 'bytes12' },
      { name: 'productId', type: 'uint32' },
      { name: 'amount', type: 'uint128' },
    ],
    outputs: [],
  },
] as const

const DEFAULT_SUBACCOUNT_NAME_BYTES12 = ('0x' + DEFAULT_NAME_HEX) as `0x${string}`

const publicClient = createPublicClient({ chain: ink, transport: http() })

function walletClient(account: string) {
  const eth = requireWallet()
  return createWalletClient({ account: account as `0x${string}`, chain: ink, transport: custom(eth) })
}

/** The live USDT0 token contract address, per Nado's own protocol config (product_id 0). */
export async function fetchUsdt0TokenAddress(): Promise<`0x${string}`> {
  const res = await query<{ data: { spot_products: { product_id: number; config: { token: string } }[] } }>({
    type: 'all_products',
  })
  const usdt0 = res.data.spot_products.find((p) => p.product_id === 0)
  if (!usdt0) throw new Error('USDT0 (product 0) not found in Nado product list.')
  return usdt0.config.token as `0x${string}`
}

export const usdt0ToRaw = (amount: number) => parseUnits(amount.toFixed(USDT0_DECIMALS), USDT0_DECIMALS)

export async function fetchUsdt0Balance(address: string): Promise<bigint> {
  const token = await fetchUsdt0TokenAddress()
  return publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
}

/**
 * Ensures the Endpoint contract can pull at least `amountRaw` USDT0 from
 * `account`. Approves for exactly `amountRaw` if the current allowance is
 * short — never an unlimited/MaxUint256 approval. No-op (no wallet prompt)
 * if already sufficiently approved.
 */
export async function ensureUsdt0Allowance(account: string, amountRaw: bigint): Promise<void> {
  const [token, contracts] = await Promise.all([fetchUsdt0TokenAddress(), fetchContracts()])
  const endpoint = contracts.endpoint_addr as `0x${string}`

  const current = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account as `0x${string}`, endpoint],
  })
  if (current >= amountRaw) return

  const client = walletClient(account)
  const hash = await client.writeContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [endpoint, amountRaw],
  })
  await publicClient.waitForTransactionReceipt({ hash })
}

/** Deposits `amountRaw` USDT0 (already scaled by usdt0ToRaw) into the caller's default subaccount. */
export async function depositUsdt0(account: string, amountRaw: bigint): Promise<`0x${string}`> {
  const contracts = await fetchContracts()
  const client = walletClient(account)
  const hash = await client.writeContract({
    address: contracts.endpoint_addr as `0x${string}`,
    abi: ENDPOINT_ABI,
    functionName: 'depositCollateral',
    args: [DEFAULT_SUBACCOUNT_NAME_BYTES12, 0, amountRaw],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

// ------------------------------------------------------------------- NLP
//
// Nado's own liquidity-provider vault — deposit USDT0, receive LP tokens
// tracking (assets + unrealized PnL) / outstanding tokens, live. Yield is
// the vault's own market-making/liquidation PnL, shared across all LPs —
// which cuts both ways (see docs.nado.xyz/core/nlp). NOT something we run
// or manage; this is a thin wrapper around Nado's own mint_nlp/burn_nlp.
//
// One real landmine found in Nado's own docs: the WebSocket example body
// and the REST example body for these two executes DISAGREE with each
// other (different field names, different shapes). The EIP712 "Signing"
// struct is the one that must match what's actually verified on-chain, so
// that's what's used here — {sender, quoteAmount, nonce} for mint,
// {sender, nlpAmount, nonce} for burn — not the REST example's shape.
// Flagged for the first real test in case this needs correcting live, the
// same way link_signer's missing 0x and the price-tick rounding did.

export interface NlpPool {
  poolId: number
  subaccount: string
  assets: number
  liabilities: number
}

export async function fetchNlpPoolInfo(): Promise<NlpPool[]> {
  const res = await fetch(`${GATEWAY}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'nlp_pool_info' }),
  })
  const json = (await res.json()) as {
    data: {
      nlp_pools: {
        pool_id: number
        subaccount: string
        // Live shape uses healths[] (initial/maintenance/unweighted), same
        // as every other subaccount_info response this app touches — the
        // docs example's flat "health" object doesn't match reality.
        subaccount_info: { healths: { assets: string; liabilities: string }[] }
      }[]
    }
  }
  return json.data.nlp_pools.map((p) => ({
    poolId: p.pool_id,
    subaccount: p.subaccount,
    assets: Number(p.subaccount_info.healths[2].assets) / 1e18,
    liabilities: Number(p.subaccount_info.healths[2].liabilities) / 1e18,
  }))
}

export interface NlpLockedBalances {
  unlockedAmount: number
  lockedAmount: number
  locked: { amount: number; unlocksAt: Date }[]
}

export async function fetchNlpLockedBalances(subaccount: string): Promise<NlpLockedBalances> {
  const res = await fetch(`${GATEWAY}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'nlp_locked_balances', subaccount }),
  })
  const json = (await res.json()) as {
    data: {
      balance_unlocked: { balance: { amount: string } }
      balance_locked: { balance: { amount: string } }
      locked_balances: { balance: { balance: { amount: string } }; unlocked_at: string }[]
    }
  }
  return {
    unlockedAmount: Number(json.data.balance_unlocked.balance.amount) / 1e18,
    lockedAmount: Number(json.data.balance_locked.balance.amount) / 1e18,
    locked: json.data.locked_balances.map((l) => ({
      amount: Number(l.balance.balance.amount) / 1e18,
      unlocksAt: new Date(Number(l.unlocked_at) * 1000),
    })),
  }
}

/** Deposits `quoteUsd` worth of USDT0 into the NLP vault, minting LP tokens 1:1 with current value. */
export async function mintNlp(account: string, quoteUsd: number): Promise<{ status: 'success' | 'failure'; error?: string }> {
  const eth = requireWallet()
  const [contracts, nonces] = await Promise.all([fetchContracts(), fetchNonces(account)])
  const sender = subaccountOf(account)
  const quoteAmount = String(BigInt(Math.round(quoteUsd * 1e18)))

  const typedData = {
    domain: {
      name: 'Nado',
      version: '0.0.1',
      chainId: parseInt(contracts.chain_id, 10),
      verifyingContract: contracts.endpoint_addr,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      MintNlp: [
        { name: 'sender', type: 'bytes32' },
        { name: 'quoteAmount', type: 'uint128' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'MintNlp',
    message: { sender, quoteAmount, nonce: String(nonces.tx_nonce) },
  }

  const signature = (await eth.request({
    method: 'eth_signTypedData_v4',
    params: [account, JSON.stringify(typedData)],
  })) as string

  const res = await fetch(`${GATEWAY}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mint_nlp: { tx: { sender, quoteAmount, nonce: String(nonces.tx_nonce) }, signature },
    }),
  })
  return res.json() as Promise<{ status: 'success' | 'failure'; error?: string }>
}

/** Burns `nlpAmount` LP tokens (up to the caller's unlocked balance), redeeming at current value minus the withdrawal fee. */
export async function burnNlp(account: string, nlpAmount: number): Promise<{ status: 'success' | 'failure'; error?: string }> {
  const eth = requireWallet()
  const [contracts, nonces] = await Promise.all([fetchContracts(), fetchNonces(account)])
  const sender = subaccountOf(account)
  const amount = String(BigInt(Math.round(nlpAmount * 1e18)))

  const typedData = {
    domain: {
      name: 'Nado',
      version: '0.0.1',
      chainId: parseInt(contracts.chain_id, 10),
      verifyingContract: contracts.endpoint_addr,
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      BurnNlp: [
        { name: 'sender', type: 'bytes32' },
        { name: 'nlpAmount', type: 'uint128' },
        { name: 'nonce', type: 'uint64' },
      ],
    },
    primaryType: 'BurnNlp',
    message: { sender, nlpAmount: amount, nonce: String(nonces.tx_nonce) },
  }

  const signature = (await eth.request({
    method: 'eth_signTypedData_v4',
    params: [account, JSON.stringify(typedData)],
  })) as string

  const res = await fetch(`${GATEWAY}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      burn_nlp: { tx: { sender, nlpAmount: amount, nonce: String(nonces.tx_nonce) }, signature },
    }),
  })
  return res.json() as Promise<{ status: 'success' | 'failure'; error?: string }>
}
