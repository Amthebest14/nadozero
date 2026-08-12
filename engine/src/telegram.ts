/**
 * Minimal Telegram Bot API wrapper — one bot for the whole service (not
 * per-follower), identified by TELEGRAM_BOT_TOKEN. A follower who wants
 * alerts finds their own numeric chat ID (e.g. via @userinfobot) and pastes
 * it into NadoZero; Telegram bots can only message a chat that has messaged
 * them first, so the follower must also send the bot at least one message
 * before an alert can land.
 *
 * Deliberately fails soft: no token configured, or a send error, just logs
 * — a missing notification should never be able to break the mirror loop
 * that's the actual point of this service.
 */

const TELEGRAM_API = 'https://api.telegram.org'

export async function sendTelegramAlert(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.log(`[telegram] not configured (no TELEGRAM_BOT_TOKEN) — would have sent to ${chatId}: ${message}`)
    return
  }
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[telegram] send failed (${res.status}) to ${chatId}: ${body}`)
    }
  } catch (e) {
    console.error(`[telegram] send error to ${chatId}:`, e instanceof Error ? e.message : e)
  }
}
