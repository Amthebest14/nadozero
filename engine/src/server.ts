/**
 * The real service: many leaders, many followers, all mirrored at once,
 * with nobody needing to run a script or paste a key anywhere. Followers
 * are registered via POST /copies (what CopyModal will call directly,
 * replacing the "download your key" step); this process watches every
 * leader that has at least one active follower and mirrors fills into all
 * of them, fanning one WebSocket subscription out to however many
 * followers are copying that leader.
 *
 * Usage: npm run serve   (needs MASTER_KEY — see generate-master-key.ts)
 */
import express from 'express'
import cors from 'cors'
import {
  DEFAULT_MAX_SLIPPAGE_PCT,
  getCopy,
  insertCopy,
  listActiveCopiesForLeader,
  listActiveLeaderSubaccounts,
  listCopiesForWallet,
  openDb,
  setCopyError,
  setCopyStatus,
  setTelegramChatId,
  type CopyMode,
} from './db.ts'
import { defaultSubaccountOf, SUBSCRIPTIONS_WS, type FillEvent } from './nado-types.ts'
import { INSUFFICIENT_HEALTH_CODES, mirrorFill, type MirrorCtx } from './mirror-core.ts'
import { computeRatio } from './sizing.ts'
import { fetchAccountEquity, fetchMarkets, type MarketInfo } from './market-data.ts'
import { sendTelegramAlert } from './telegram.ts'

const PORT = Number(process.env.PORT ?? 8080)
const DB_PATH = process.env.DB_PATH ?? './nadozero.db'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*'

const isAddress = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)
const isPrivateKey = (v: unknown): v is `0x${string}` => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)

async function main() {
  const db = openDb(DB_PATH)

  console.log('Loading market reference data...')
  let markets: Map<number, MarketInfo> = await fetchMarkets()
  setInterval(() => fetchMarkets().then((m) => (markets = m)).catch(() => {}), 10 * 60_000)

  /** One WebSocket per leader being watched, fanned out to every active follower on each fill. */
  const watchers = new Map<string, WebSocket>()

  function watchLeader(leaderSubaccount: string) {
    if (watchers.has(leaderSubaccount)) return
    const ws = new WebSocket(SUBSCRIPTIONS_WS)
    watchers.set(leaderSubaccount, ws)

    ws.addEventListener('open', () => {
      console.log(`[watch] connected — subscribing to ${leaderSubaccount.slice(0, 10)}…`)
      ws.send(JSON.stringify({ method: 'subscribe', stream: { type: 'fill', subaccount: leaderSubaccount, product_id: null }, id: 1 }))
    })

    ws.addEventListener('message', (ev) => {
      let msg: unknown
      try {
        msg = JSON.parse(ev.data.toString())
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object' || (msg as { type?: string }).type !== 'fill') return

      const followers = listActiveCopiesForLeader(db, leaderSubaccount)
      for (const f of followers) {
        const ctx: MirrorCtx = {
          markets,
          mode: f.mode,
          ratio: f.mode === 'proportional' ? computeRatio(f.allocationUsd!, f.leaderEquityAtSignup!) : null,
          fixedUsd: f.mode === 'fixed' ? f.fixedUsd : null,
          maxSlippagePct: f.maxSlippagePct,
          maxPositionUsd: f.maxPositionUsd,
          followerSubaccount: f.followerSubaccount,
          followerKey: f.followerPrivateKey,
          label: f.id.slice(0, 8),
        }
        mirrorFill(msg as FillEvent, ctx).then((outcome) => {
          if (outcome.kind === 'failed' && outcome.errorCode && INSUFFICIENT_HEALTH_CODES.has(outcome.errorCode)) {
            const reason = `Paused: insufficient account health (${outcome.error ?? `code ${outcome.errorCode}`})`
            console.log(`[${f.id.slice(0, 8)}] auto-pausing: insufficient account health (code ${outcome.errorCode})`)
            setCopyError(db, f.id, reason)
            stopWatchingIfIdle(leaderSubaccount)
            if (f.telegramChatId) {
              void sendTelegramAlert(
                f.telegramChatId,
                `⏸ NadoZero paused your copy of ${f.leaderAddress.slice(0, 8)}…\n\n${reason}\n\nResume it from My Copies once you've topped up.`,
              )
            }
          }
        })
      }
    })

    ws.addEventListener('close', (ev) => {
      console.log(`[watch] ${leaderSubaccount.slice(0, 10)}… closed (code=${ev.code}) — reconnecting in 3s`)
      watchers.delete(leaderSubaccount)
      setTimeout(() => {
        // only reconnect if someone's still actively copying this leader
        if (listActiveCopiesForLeader(db, leaderSubaccount).length > 0) watchLeader(leaderSubaccount)
      }, 3000)
    })

    ws.addEventListener('error', (ev) => console.error(`[watch] error on ${leaderSubaccount.slice(0, 10)}…:`, ev))
  }

  function stopWatchingIfIdle(leaderSubaccount: string) {
    if (listActiveCopiesForLeader(db, leaderSubaccount).length === 0) {
      watchers.get(leaderSubaccount)?.close()
      watchers.delete(leaderSubaccount)
    }
  }

  console.log('Resuming existing active copies...')
  for (const leaderSubaccount of listActiveLeaderSubaccounts(db)) watchLeader(leaderSubaccount)

  // ---------------------------------------------------------------- API

  const app = express()
  app.use(cors({ origin: ALLOWED_ORIGIN }))
  app.use(express.json())

  app.get('/health', (_req, res) => res.json({ status: 'ok', watching: watchers.size }))

  app.post('/copies', async (req, res) => {
    const {
      leaderAddress,
      followerWalletAddress,
      followerPrivateKey,
      mode,
      allocationUsd,
      fixedUsd,
      maxSlippagePct,
      maxPositionUsd,
      telegramChatId,
    } = req.body ?? {}

    if (!isAddress(leaderAddress)) return res.status(400).json({ error: 'leaderAddress must be a 0x address' })
    if (!isAddress(followerWalletAddress)) return res.status(400).json({ error: 'followerWalletAddress must be a 0x address' })
    if (!isPrivateKey(followerPrivateKey)) return res.status(400).json({ error: 'followerPrivateKey must be a 0x + 64 hex private key' })
    if (mode !== 'proportional' && mode !== 'fixed') return res.status(400).json({ error: 'mode must be "proportional" or "fixed"' })
    if (maxSlippagePct !== undefined && (typeof maxSlippagePct !== 'number' || maxSlippagePct <= 0 || maxSlippagePct > 0.2)) {
      return res.status(400).json({ error: 'maxSlippagePct must be a number between 0 and 0.2 (20%)' })
    }
    if (typeof maxPositionUsd !== 'number' || maxPositionUsd <= 0) {
      return res.status(400).json({ error: 'maxPositionUsd must be a positive number' })
    }

    // Normalize case ONCE, here, before anything is stored or compared —
    // wallet extensions inconsistently return checksummed (mixed-case) or
    // plain-lowercase addresses, and SQLite string comparison is
    // case-sensitive by default. Every downstream read (GET /copies) must
    // normalize the same way, or a real address can silently stop matching
    // its own stored rows (found this live: a real registered copy became
    // invisible to its own owner because of exactly this mismatch).
    const leaderAddressNorm = (leaderAddress as string).toLowerCase()
    const followerWalletAddressNorm = (followerWalletAddress as string).toLowerCase()

    const leaderSubaccount = defaultSubaccountOf(leaderAddressNorm)
    const followerSubaccount = defaultSubaccountOf(followerWalletAddressNorm)
    if (leaderSubaccount.toLowerCase() === followerSubaccount.toLowerCase()) {
      return res.status(400).json({ error: 'Leader and follower cannot be the same subaccount (infinite mirror loop)' })
    }

    let leaderEquityAtSignup: number | null = null
    if (mode === 'proportional') {
      if (typeof allocationUsd !== 'number' || allocationUsd <= 0) {
        return res.status(400).json({ error: 'allocationUsd must be a positive number for proportional mode' })
      }
      try {
        leaderEquityAtSignup = await fetchAccountEquity(leaderSubaccount)
      } catch {
        return res.status(502).json({ error: 'Could not read leader equity — try again shortly' })
      }
      if (leaderEquityAtSignup <= 0) {
        return res.status(400).json({ error: 'Leader has non-positive equity — refusing to compute a copy ratio' })
      }
    } else {
      if (typeof fixedUsd !== 'number' || fixedUsd <= 0) {
        return res.status(400).json({ error: 'fixedUsd must be a positive number for fixed mode' })
      }
    }

    const id = insertCopy(db, {
      leaderAddress: leaderAddressNorm,
      leaderSubaccount,
      followerWalletAddress: followerWalletAddressNorm,
      followerSubaccount,
      followerPrivateKey,
      mode: mode as CopyMode,
      allocationUsd: mode === 'proportional' ? allocationUsd : undefined,
      fixedUsd: mode === 'fixed' ? fixedUsd : undefined,
      leaderEquityAtSignup: leaderEquityAtSignup ?? undefined,
      maxSlippagePct: maxSlippagePct ?? DEFAULT_MAX_SLIPPAGE_PCT,
      maxPositionUsd,
      telegramChatId: typeof telegramChatId === 'string' && telegramChatId.trim() ? telegramChatId.trim() : undefined,
    })

    watchLeader(leaderSubaccount)
    res.status(201).json({ id })
  })

  app.get('/copies', (req, res) => {
    const wallet = req.query.wallet
    if (!isAddress(wallet)) return res.status(400).json({ error: 'wallet query param must be a 0x address' })
    res.json(listCopiesForWallet(db, (wallet as string).toLowerCase()))
  })

  app.post('/copies/:id/pause', (req, res) => {
    const copy = getCopy(db, req.params.id)
    if (!copy) return res.status(404).json({ error: 'not found' })
    setCopyStatus(db, copy.id, 'paused')
    stopWatchingIfIdle(copy.leaderSubaccount)
    res.json({ ok: true })
  })

  app.post('/copies/:id/resume', (req, res) => {
    const copy = getCopy(db, req.params.id)
    if (!copy) return res.status(404).json({ error: 'not found' })
    setCopyStatus(db, copy.id, 'active')
    watchLeader(copy.leaderSubaccount)
    res.json({ ok: true })
  })

  app.delete('/copies/:id', (req, res) => {
    const copy = getCopy(db, req.params.id)
    if (!copy) return res.status(404).json({ error: 'not found' })
    setCopyStatus(db, copy.id, 'stopped')
    stopWatchingIfIdle(copy.leaderSubaccount)
    res.json({ ok: true })
  })

  app.post('/copies/:id/telegram', (req, res) => {
    const copy = getCopy(db, req.params.id)
    if (!copy) return res.status(404).json({ error: 'not found' })
    const { chatId } = req.body ?? {}
    if (chatId !== null && (typeof chatId !== 'string' || !chatId.trim())) {
      return res.status(400).json({ error: 'chatId must be a non-empty string, or null to remove it' })
    }
    setTelegramChatId(db, copy.id, chatId === null ? null : chatId.trim())
    res.json({ ok: true })
  })

  app.listen(PORT, () => console.log(`\nNadoZero mirror service listening on :${PORT}`))
}

main().catch((e) => {
  console.error('Fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
