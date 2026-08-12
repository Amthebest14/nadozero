/**
 * Generates a brand-new, random signer keypair for a NadoZero follower
 * subaccount. This key is NOT your main wallet — it's a fresh one, created
 * only so the mirror engine can place orders on your behalf.
 *
 * IMPORTANT — read this before running it for real:
 *   - The private key is written straight to a local .env file and is
 *     NEVER printed to the terminal. Don't paste it anywhere — not into
 *     chat, not into a screenshot, not into a support ticket.
 *   - Per Nado's own docs, a linked signer has FULL permissions on the
 *     subaccount it's linked to — trading AND withdrawal. Treat this key
 *     with the same care as a hot wallet, because that's what it is.
 *   - Only deposit small, "pocket change" amounts into whatever subaccount
 *     you link this signer to, at least until the mirror engine has been
 *     tested thoroughly.
 *   - This script only GENERATES the key. It does not link it, fund it, or
 *     touch Nado in any way — that's a separate, deliberate step you take
 *     with your own main wallet.
 *
 * Usage: npm run generate-signer
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const KEY_NAME = 'FOLLOWER_SIGNER_PRIVATE_KEY'

const force = process.argv.includes('--force')

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf8')
  if (new RegExp(`^${KEY_NAME}=0x[0-9a-fA-F]{64}`, 'm').test(existing) && !force) {
    console.error(`A signer already exists in ${envPath}.`)
    console.error('Re-run with --force if you deliberately want to replace it')
    console.error('(you will need to re-link the new signer on Nado afterwards).')
    process.exit(1)
  }
}

const privateKey = generatePrivateKey()
const account = privateKeyToAccount(privateKey)

const line = `${KEY_NAME}=${privateKey}\n`
if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf8')
  const stripped = existing.replace(new RegExp(`^${KEY_NAME}=.*$`, 'm'), '').trimEnd()
  writeFileSync(envPath, `${stripped}\n${line}`, { mode: 0o600 })
} else {
  writeFileSync(envPath, line, { mode: 0o600 })
}

console.log('New signer generated.\n')
console.log(`Address (safe to share, this is public):\n  ${account.address}\n`)
console.log(`Private key written to:\n  ${envPath}\n`)
console.log('This file is in .gitignore and was never printed above — keep it that way.')
console.log('\nNext steps (you do these yourself, with your own main wallet):')
console.log('  1. Create/pick the Nado subaccount you want this to mirror-trade for.')
console.log('  2. Deposit a small test amount — this key can trade AND withdraw')
console.log('     whatever is in that subaccount, so start small.')
console.log(`  3. Link this address as that subaccount's signer (link_signer execute),`)
console.log(`     signed with your MAIN wallet key — never with this generated key.`)
