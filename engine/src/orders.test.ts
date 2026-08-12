import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generatePrivateKey } from 'viem/accounts'
import { signOrder } from './orders.ts'
import { encodeAppendix, OrderType, productVerifyingContract, buildOrderNonce } from './nado-types.ts'

// Throwaway key generated fresh for this test run — never funded, never linked, disposable.
const testKey = generatePrivateKey()

test('signOrder produces a well-formed signature without touching the network', async () => {
  const signed = await signOrder({
    productId: 2, // BTC-PERP
    sender: '0x' + '11'.repeat(20) + '64656661756c740000000000',
    priceX18: 65_000_000_000_000_000_000_000n, // $65,000
    amount: 10_000_000_000_000_000n, // 0.01 BTC, buy
    appendix: encodeAppendix({ orderType: OrderType.IOC }),
    followerPrivateKey: testKey,
  })

  assert.match(signed.signature, /^0x[0-9a-f]{130}$/i, 'signature should be 0x + 65 bytes (r,s,v)')
  assert.equal(typeof signed.nonce, 'bigint')
  assert.ok(signed.nonce > 0n)
})

test('productVerifyingContract matches the docs example exactly (product 18)', () => {
  assert.equal(productVerifyingContract(18), '0x0000000000000000000000000000000000000012')
})

test('encodeAppendix/decodeAppendix round-trip for an IOC reduce-only order with a builder id', async () => {
  const { decodeAppendix } = await import('./nado-types.ts')
  const encoded = encodeAppendix({ orderType: OrderType.IOC, reduceOnly: true, builderId: 4300, builderFeeRate: 10 })
  const decoded = decodeAppendix(encoded.toString())
  assert.equal(decoded.orderType, OrderType.IOC)
  assert.equal(decoded.reduceOnly, true)
  assert.equal(decoded.builderId, 4300)
  assert.equal(decoded.builderFeeRate, 10)
  assert.equal(decoded.isolated, false)
})

test('buildOrderNonce packs recv_time into the top 44 bits and random into the bottom 20', () => {
  const now = Date.now()
  const nonce = buildOrderNonce(now, 12345)
  assert.equal(nonce >> 20n, BigInt(now))
  assert.equal(nonce & 0xfffffn, 12345n)
})

test('signOrder rejects a garbage private key before ever reaching the network', async () => {
  await assert.rejects(() =>
    signOrder({
      productId: 2,
      sender: '0x' + '11'.repeat(20) + '64656661756c740000000000',
      priceX18: 1n,
      amount: 1n,
      appendix: 0n,
      followerPrivateKey: '0xnotarealkey' as `0x${string}`,
    }),
  )
})
