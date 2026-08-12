import { test } from 'node:test'
import assert from 'node:assert/strict'
import { roundPriceX18ToTick } from './market-data.ts'

test('roundPriceX18ToTick: the exact live production failure — SNDK-PERP, price ~1332.1, tick 0.1', () => {
  // Reproduces a real rejection seen in prod logs: the old float path
  // (Math.round(price/tick)*tick, then *1e18) produced
  // 1332100000000000131072n — NOT a multiple of the 0.1 tick — and Nado
  // rejected every single order with code 2000 InvalidPriceIncrement.
  const tick = 100_000_000_000_000_000n // 0.1 in x18
  const rawFloatBugged = 1332100000000000131072n // what the old code actually sent, verified in prod logs
  assert.notEqual(rawFloatBugged % tick, 0n, 'sanity: confirms the bug really does produce a non-multiple')

  const rounded = roundPriceX18ToTick(rawFloatBugged, tick)
  assert.equal(rounded % tick, 0n, 'must be an exact multiple of the tick — this is the whole point')
})

test('roundPriceX18ToTick: rounds to nearest, not just down', () => {
  const tick = 10_000_000_000_000_000n // 0.01
  // 1.236 -> nearest 0.01 multiple is 1.24
  const price = 1_236_000_000_000_000_000n
  assert.equal(roundPriceX18ToTick(price, tick), 1_240_000_000_000_000_000n)
})

test('roundPriceX18ToTick: already-exact price is untouched', () => {
  const tick = 10_000_000_000_000_000n
  const price = 65_000_000_000_000_000_000n // exactly 65000, a multiple of 0.01
  assert.equal(roundPriceX18ToTick(price, tick), price)
})

test('roundPriceX18ToTick: zero or negative tick is a no-op (never divides by zero)', () => {
  assert.equal(roundPriceX18ToTick(123n, 0n), 123n)
  assert.equal(roundPriceX18ToTick(123n, -5n), 123n)
})
