import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFixedMirrorSize, computeMirrorSize, computeRatio } from './sizing.ts'

// Real market constraints observed this session (symbols endpoint):
// BTC-PERP: size_increment 0.00001, min_size small; PUMP-PERP: whole-unit-ish, large min.
const BTC = { sizeIncrement: 0.00001, minSize: 0.0001 }
const PUMP = { sizeIncrement: 1, minSize: 1000 }

test('computeRatio: basic allocation vs equity', () => {
  assert.equal(computeRatio(100, 1000), 0.1)
  assert.equal(computeRatio(50, 500_000), 0.0001)
})

test('computeRatio: rejects non-positive equity or allocation', () => {
  assert.throws(() => computeRatio(100, 0))
  assert.throws(() => computeRatio(100, -5))
  assert.throws(() => computeRatio(0, 1000))
})

test('computeMirrorSize: proportional buy, rounds down to increment', () => {
  // leader buys 0.1 BTC, follower ratio 0.1 -> raw 0.01, already on-increment
  const r = computeMirrorSize({ leaderFillQty: 0.1, ratio: 0.1, market: BTC })
  assert.equal(r.qty, 0.01)
})

test('computeMirrorSize: sell (negative) stays negative after mirroring', () => {
  const r = computeMirrorSize({ leaderFillQty: -0.1, ratio: 0.1, market: BTC })
  assert.equal(r.qty, -0.01)
})

test('computeMirrorSize: rounds toward zero, never oversizes', () => {
  // raw = 0.033 * ratio-implied qty that lands mid-increment
  const r = computeMirrorSize({ leaderFillQty: 0.337, ratio: 0.1, market: BTC })
  // raw = 0.0337 -> steps = floor(0.0337/0.00001) = 3370 -> 0.0337 exactly representable-ish
  assert.ok(r.qty !== null)
  assert.ok(Math.abs(r.qty!) <= 0.0337 + 1e-12)
})

test('computeMirrorSize: below-minimum sized order is rejected, not silently zeroed', () => {
  // tiny leader fill on a small ratio, real case: whale leader, small follower, illiquid market
  const r = computeMirrorSize({ leaderFillQty: 500, ratio: 0.0005, market: PUMP })
  // raw = 0.25, below PUMP's min_size of 1000 -> must reject with a reason, not place a garbage order
  assert.equal(r.qty, null)
  assert.match(r.reason ?? '', /below market minimum/)
})

test('computeMirrorSize: zero leader fill is a no-op, not an error', () => {
  const r = computeMirrorSize({ leaderFillQty: 0, ratio: 0.1, market: BTC })
  assert.equal(r.qty, null)
})

test('computeMirrorSize: fixed ratio keeps a full close proportional to the original open', () => {
  // Same ratio used for open and close -> follower's close exactly matches their own open size.
  const open = computeMirrorSize({ leaderFillQty: 0.5, ratio: 0.02, market: BTC })
  const close = computeMirrorSize({ leaderFillQty: -0.5, ratio: 0.02, market: BTC })
  assert.ok(open.qty !== null && close.qty !== null)
  assert.equal(open.qty, -close.qty)
})

// ------------------------------------------------------- computeFixedMirrorSize

test('computeFixedMirrorSize: $10 at $65,000 BTC mirrors a small buy', () => {
  const r = computeFixedMirrorSize({ leaderFillQty: 0.5, fixedUsd: 10, price: 65_000, market: BTC })
  // 10/65000 = 0.0001538..., rounds down to the 0.00001 increment -> 0.00015
  // (epsilon compare: known float-precision caveat documented at the top of sizing.ts)
  assert.ok(Math.abs(r.qty! - 0.00015) < 1e-12)
})

test('computeFixedMirrorSize: direction follows the leader regardless of leader size', () => {
  const buy = computeFixedMirrorSize({ leaderFillQty: 500_000, fixedUsd: 10, price: 65_000, market: BTC })
  const sell = computeFixedMirrorSize({ leaderFillQty: -500_000, fixedUsd: 10, price: 65_000, market: BTC })
  assert.ok(buy.qty! > 0)
  assert.ok(sell.qty! < 0)
  assert.equal(buy.qty, -sell.qty!)
})

test('computeFixedMirrorSize: this is the whole point — a whale leader does not shrink a small fixed size', () => {
  // Leader trades 500 BTC (a whale) vs 0.01 BTC (a normal trader); fixed-$10 follower
  // size is IDENTICAL either way, unlike the proportional model which would round the
  // whale case to dust for a small follower.
  const small = computeFixedMirrorSize({ leaderFillQty: 0.01, fixedUsd: 10, price: 65_000, market: BTC })
  const whale = computeFixedMirrorSize({ leaderFillQty: 500, fixedUsd: 10, price: 65_000, market: BTC })
  assert.ok(small.qty !== null, 'sanity: this test is meaningless if both sides are null')
  assert.equal(small.qty, whale.qty)
})

test('computeFixedMirrorSize: below the market minimum is rejected with a clear reason', () => {
  const r = computeFixedMirrorSize({ leaderFillQty: 100, fixedUsd: 1, price: 0.002, market: PUMP })
  // $1 / $0.002 = 500 units, below PUMP's 1000 min_size
  assert.equal(r.qty, null)
  assert.match(r.reason ?? '', /below market minimum/)
})

test('computeFixedMirrorSize: rejects zero leader fill and invalid price', () => {
  assert.equal(computeFixedMirrorSize({ leaderFillQty: 0, fixedUsd: 1, price: 65_000, market: BTC }).qty, null)
  assert.equal(computeFixedMirrorSize({ leaderFillQty: 1, fixedUsd: 1, price: 0, market: BTC }).qty, null)
})
