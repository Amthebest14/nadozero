/**
 * Persistent, encrypted-at-rest store for follower copy relationships.
 * SQLite on a local file (mounted on a Fly volume in production so it
 * survives restarts/redeploys — see fly.toml).
 *
 * Encryption: AES-256-GCM with a server-held master key (MASTER_KEY env
 * var — generate with `npm run generate-master-key`, never commit it).
 * Honest about the security level: this is meaningfully better than the
 * plaintext-in-a-downloaded-file status quo, but it is NOT yet HSM/KMS-grade
 * key custody. Treat that as a real follow-up before trusting this with
 * more than pocket-change testing.
 */
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

export type CopyStatus = 'active' | 'paused' | 'stopped'
export type CopyMode = 'proportional' | 'fixed'

export interface CopyRecord {
  id: string
  leaderAddress: string
  leaderSubaccount: string
  followerWalletAddress: string
  followerSubaccount: string
  mode: CopyMode
  allocationUsd: number | null
  fixedUsd: number | null
  /** Proportional mode only — leader's equity USD at signup. Ratio is derived from this + allocationUsd, never re-measured, so it must survive restarts (hence stored, not cached in memory). */
  leaderEquityAtSignup: number | null
  /** Fraction, e.g. 0.005 = 0.5% — max acceptable slippage on a mirrored IOC order. */
  maxSlippagePct: number
  /** USD notional ceiling on this copy's position in any one market — a mirrored order that would push past it is skipped, not resized. null = no cap (only possible on rows from before this field existed). */
  maxPositionUsd: number | null
  /** Ceiling on TOTAL resulting exposure across every market, as a multiple of current equity — null = no cap (rows from before this field existed). */
  maxLeverageMultiplier: number | null
  status: CopyStatus
  /** Set when auto-paused by an insufficient-health order rejection (2006/2036) — null otherwise. */
  lastError: string | null
  lastErrorAt: number | null
  /** Optional — if set, a Telegram alert is sent to this chat when the copy auto-pauses. */
  telegramChatId: string | null
  createdAt: number
}

export interface CopyRecordWithKey extends CopyRecord {
  followerPrivateKey: `0x${string}`
}

export const DEFAULT_MAX_SLIPPAGE_PCT = 0.005

function requireMasterKey(): Buffer {
  const hex = process.env.MASTER_KEY
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('MASTER_KEY must be a 64-char hex string (32 bytes) — run `npm run generate-master-key`')
  }
  return Buffer.from(hex, 'hex')
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((b) => b.toString('hex')).join(':')
}

function decrypt(payload: string, key: Buffer): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}

export function openDb(path: string): Database.Database {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS copies (
      id TEXT PRIMARY KEY,
      leader_address TEXT NOT NULL,
      leader_subaccount TEXT NOT NULL,
      follower_wallet_address TEXT NOT NULL,
      follower_subaccount TEXT NOT NULL,
      encrypted_signer_key TEXT NOT NULL,
      mode TEXT NOT NULL,
      allocation_usd REAL,
      fixed_usd REAL,
      leader_equity_at_signup REAL,
      max_slippage_pct REAL NOT NULL DEFAULT 0.005,
      max_position_usd REAL,
      max_leverage_multiplier REAL,
      last_error TEXT,
      last_error_at INTEGER,
      telegram_chat_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_copies_leader ON copies(leader_subaccount) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_copies_follower ON copies(follower_wallet_address);
  `)
  // Forward-compatible migration for a DB created before these columns existed —
  // CREATE TABLE IF NOT EXISTS above is a no-op against an already-existing table.
  for (const stmt of [
    `ALTER TABLE copies ADD COLUMN max_slippage_pct REAL NOT NULL DEFAULT 0.005`,
    `ALTER TABLE copies ADD COLUMN max_position_usd REAL`,
    `ALTER TABLE copies ADD COLUMN max_leverage_multiplier REAL`,
    `ALTER TABLE copies ADD COLUMN last_error TEXT`,
    `ALTER TABLE copies ADD COLUMN last_error_at INTEGER`,
    `ALTER TABLE copies ADD COLUMN telegram_chat_id TEXT`,
  ]) {
    try {
      db.exec(stmt)
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('duplicate column')) throw e
    }
  }
  return db
}

interface NewCopyInput {
  leaderAddress: string
  leaderSubaccount: string
  followerWalletAddress: string
  followerSubaccount: string
  followerPrivateKey: `0x${string}`
  mode: CopyMode
  allocationUsd?: number
  fixedUsd?: number
  /** Required if mode === 'proportional' — see CopyRecord.leaderEquityAtSignup. */
  leaderEquityAtSignup?: number
  maxSlippagePct?: number
  /** USD notional ceiling on this copy's position — no default; the caller (CopyModal) always sets one deliberately. */
  maxPositionUsd: number
  /** Cap on total exposure across every market, as a multiple of equity (e.g. 5 = 5x) — no default, CopyModal always sets one. */
  maxLeverageMultiplier: number
  telegramChatId?: string
}

export function insertCopy(db: Database.Database, input: NewCopyInput): string {
  const id = randomUUID()
  const encryptedKey = encrypt(input.followerPrivateKey, requireMasterKey())
  db.prepare(
    `INSERT INTO copies
      (id, leader_address, leader_subaccount, follower_wallet_address, follower_subaccount,
       encrypted_signer_key, mode, allocation_usd, fixed_usd, leader_equity_at_signup,
       max_slippage_pct, max_position_usd, max_leverage_multiplier, telegram_chat_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    input.leaderAddress,
    input.leaderSubaccount,
    input.followerWalletAddress,
    input.followerSubaccount,
    encryptedKey,
    input.mode,
    input.allocationUsd ?? null,
    input.fixedUsd ?? null,
    input.leaderEquityAtSignup ?? null,
    input.maxSlippagePct ?? DEFAULT_MAX_SLIPPAGE_PCT,
    input.maxPositionUsd,
    input.maxLeverageMultiplier,
    input.telegramChatId ?? null,
    Date.now(),
  )
  return id
}

interface Row {
  id: string
  leader_address: string
  leader_subaccount: string
  follower_wallet_address: string
  follower_subaccount: string
  encrypted_signer_key: string
  mode: CopyMode
  allocation_usd: number | null
  fixed_usd: number | null
  leader_equity_at_signup: number | null
  max_slippage_pct: number
  max_position_usd: number | null
  max_leverage_multiplier: number | null
  last_error: string | null
  last_error_at: number | null
  telegram_chat_id: string | null
  status: CopyStatus
  created_at: number
}

function toRecord(r: Row): CopyRecord {
  return {
    id: r.id,
    leaderAddress: r.leader_address,
    leaderSubaccount: r.leader_subaccount,
    followerWalletAddress: r.follower_wallet_address,
    followerSubaccount: r.follower_subaccount,
    mode: r.mode,
    allocationUsd: r.allocation_usd,
    fixedUsd: r.fixed_usd,
    leaderEquityAtSignup: r.leader_equity_at_signup,
    maxSlippagePct: r.max_slippage_pct,
    maxPositionUsd: r.max_position_usd,
    maxLeverageMultiplier: r.max_leverage_multiplier,
    status: r.status,
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
    telegramChatId: r.telegram_chat_id,
    createdAt: r.created_at,
  }
}

export function setTelegramChatId(db: Database.Database, id: string, chatId: string | null): void {
  db.prepare(`UPDATE copies SET telegram_chat_id = ? WHERE id = ?`).run(chatId, id)
}

/** All active copies for one leader, WITH decrypted keys — only ever called inside the mirror manager. */
export function listActiveCopiesForLeader(db: Database.Database, leaderSubaccount: string): CopyRecordWithKey[] {
  const key = requireMasterKey()
  const rows = db
    .prepare(`SELECT * FROM copies WHERE leader_subaccount = ? AND status = 'active'`)
    .all(leaderSubaccount) as Row[]
  return rows.map((r) => ({ ...toRecord(r), followerPrivateKey: decrypt(r.encrypted_signer_key, key) as `0x${string}` }))
}

/** Distinct leader subaccounts with at least one active copy — used on startup to know what to watch. */
export function listActiveLeaderSubaccounts(db: Database.Database): string[] {
  const rows = db.prepare(`SELECT DISTINCT leader_subaccount FROM copies WHERE status = 'active'`).all() as {
    leader_subaccount: string
  }[]
  return rows.map((r) => r.leader_subaccount)
}

/** For the "My Copies" UI — never includes the key. */
export function listCopiesForWallet(db: Database.Database, followerWalletAddress: string): CopyRecord[] {
  const rows = db
    .prepare(`SELECT * FROM copies WHERE follower_wallet_address = ? ORDER BY created_at DESC`)
    .all(followerWalletAddress) as Row[]
  return rows.map(toRecord)
}

export function getCopy(db: Database.Database, id: string): CopyRecord | null {
  const row = db.prepare(`SELECT * FROM copies WHERE id = ?`).get(id) as Row | undefined
  return row ? toRecord(row) : null
}

export function setCopyStatus(db: Database.Database, id: string, status: CopyStatus): void {
  // Resuming or stopping both clear any prior auto-pause reason — it only
  // describes "why this is currently paused", which is no longer true once
  // you've left the paused state either direction.
  if (status === 'active' || status === 'stopped') {
    db.prepare(`UPDATE copies SET status = ?, last_error = NULL, last_error_at = NULL WHERE id = ?`).run(status, id)
  } else {
    db.prepare(`UPDATE copies SET status = ? WHERE id = ?`).run(status, id)
  }
}

/** Auto-pause a copy because Nado rejected an order for insufficient account health (2006/2036). */
export function setCopyError(db: Database.Database, id: string, message: string): void {
  db.prepare(`UPDATE copies SET status = 'paused', last_error = ?, last_error_at = ? WHERE id = ?`).run(
    message,
    Date.now(),
    id,
  )
}
