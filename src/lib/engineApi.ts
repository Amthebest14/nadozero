/**
 * Client for the deployed mirror service (engine/src/server.ts). This is the
 * one place in the frontend that sends a private key over the network — by
 * design, right after generating it, so it never has to be shown to or
 * saved by the user. Everything else in this app either reads public data
 * or asks the user's own wallet to sign something.
 */

const API_URL = import.meta.env.VITE_ENGINE_API_URL ?? 'https://nadozero-mirror.fly.dev'

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
  leaderEquityAtSignup: number | null
  maxSlippagePct: number
  maxPositionUsd: number | null
  maxLeverageMultiplier: number | null
  status: 'active' | 'paused' | 'stopped'
  /** Set when the service auto-paused this copy (insufficient account health) — null otherwise, including manual pauses. */
  lastError: string | null
  lastErrorAt: number | null
  /** If set, a Telegram alert is sent to this chat when the copy auto-pauses. */
  telegramChatId: string | null
  createdAt: number
}

export const DEFAULT_MAX_SLIPPAGE_PCT = 0.005

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
  return body as T
}

export interface RegisterCopyInput {
  leaderAddress: string
  followerWalletAddress: string
  followerPrivateKey: `0x${string}`
  mode: CopyMode
  allocationUsd?: number
  fixedUsd?: number
  maxSlippagePct?: number
  maxPositionUsd: number
  maxLeverageMultiplier: number
}

export const registerCopy = (input: RegisterCopyInput) =>
  request<{ id: string }>('/copies', { method: 'POST', body: JSON.stringify(input) })

export const listCopies = (wallet: string) =>
  request<CopyRecord[]>(`/copies?wallet=${wallet}`)

export const pauseCopy = (id: string) => request<{ ok: true }>(`/copies/${id}/pause`, { method: 'POST' })
export const resumeCopy = (id: string) => request<{ ok: true }>(`/copies/${id}/resume`, { method: 'POST' })
export const stopCopy = (id: string) => request<{ ok: true }>(`/copies/${id}`, { method: 'DELETE' })
export const setCopyTelegram = (id: string, chatId: string | null) =>
  request<{ ok: true }>(`/copies/${id}/telegram`, { method: 'POST', body: JSON.stringify({ chatId }) })

export const checkEngineHealth = () => request<{ status: string; watching: number }>('/health')
