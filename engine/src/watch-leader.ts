/**
 * Read-only proof of concept: watch a real trader's public fill stream live.
 * No keys, no signing, no orders placed. This just proves we can react to a
 * leader's trades in real time before any money or custody enters the picture.
 *
 * Usage:
 *   LEADER=0x... npm run watch              (assumes the "default" subaccount)
 *   LEADER_SUBACCOUNT=0x...(64 hex) npm run watch   (exact subaccount — traders
 *     aren't always on "default"; verify via the Subaccounts query if unsure)
 */
import { SUBSCRIPTIONS_WS, decodeAppendix, defaultSubaccountOf, fromX18, type FillEvent } from './nado-types.ts'

const leaderAddress = process.env.LEADER
const explicitSubaccount = process.env.LEADER_SUBACCOUNT

if (!leaderAddress && !explicitSubaccount) {
  console.error('Usage: LEADER=0xYourTestAddress npm run watch')
  console.error('   or: LEADER_SUBACCOUNT=0x<64-hex> npm run watch  (if not on the "default" subaccount)')
  process.exit(1)
}

const subaccount = explicitSubaccount ?? defaultSubaccountOf(leaderAddress!)
console.log(`Watching fills for ${leaderAddress ?? '(explicit subaccount)'}`)
console.log(`Subaccount: ${subaccount}`)
if (!explicitSubaccount) {
  console.log(`(assuming "default" subaccount — pass LEADER_SUBACCOUNT if this trader uses a named one)`)
}
console.log(`Connecting to ${SUBSCRIPTIONS_WS} ...\n`)

const ws = new WebSocket(SUBSCRIPTIONS_WS)

ws.addEventListener('open', () => {
  console.log('Connected. Subscribing to fill stream (all products)...')
  ws.send(
    JSON.stringify({
      method: 'subscribe',
      stream: { type: 'fill', subaccount, product_id: null },
      id: 1,
    }),
  )
})

ws.addEventListener('message', (ev) => {
  let msg: unknown
  try {
    msg = JSON.parse(ev.data.toString())
  } catch {
    return
  }

  if (!msg || typeof msg !== 'object' || (msg as { type?: string }).type !== 'fill') {
    console.log('[control]', JSON.stringify(msg))
    return
  }

  const fill = msg as FillEvent
  const { builderId } = decodeAppendix(fill.appendix)
  const side = fill.is_bid ? 'BUY ' : 'SELL'
  const qty = Math.abs(fromX18(fill.filled_qty))
  const price = fromX18(fill.price)
  const notional = qty * price
  const role = fill.is_taker ? 'taker' : 'maker'

  console.log(
    `[FILL] product=${fill.product_id} ${side} qty=${qty.toFixed(4)} @ ${price.toFixed(2)} ` +
      `≈$${notional.toFixed(2)} (${role}) builder=${builderId || 'none'} digest=${fill.order_digest.slice(0, 10)}…`,
  )

  // ---- this is where mirror sizing would happen in the next step ----
  // e.g. followerOrderSize = (followerEquity / leaderEquity) * qty
})

ws.addEventListener('close', (ev) => {
  console.log(`Connection closed (code=${ev.code}). Reconnect logic goes here for production.`)
})

ws.addEventListener('error', (ev) => {
  console.error('WebSocket error:', ev)
})

process.on('SIGINT', () => {
  console.log('\nClosing...')
  ws.close()
  process.exit(0)
})
