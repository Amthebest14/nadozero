/**
 * Generates the server's master encryption key — used to encrypt every
 * follower's signer key at rest in the database. This is YOUR secret, not a
 * follower's: you need to know it (to set it on Fly), unlike a follower's
 * private key which nobody but them should ever see.
 *
 * Still never printed to the terminal, on principle — written straight to
 * a local file instead.
 *
 * Usage: npm run generate-master-key
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const KEY_NAME = 'MASTER_KEY'
const force = process.argv.includes('--force')

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf8')
  if (new RegExp(`^${KEY_NAME}=[0-9a-fA-F]{64}`, 'm').test(existing) && !force) {
    console.error(`A master key already exists in ${envPath}.`)
    console.error('Re-run with --force if you deliberately want to replace it —')
    console.error('every currently-stored follower key becomes unreadable when you do.')
    process.exit(1)
  }
}

const key = randomBytes(32).toString('hex')
const line = `${KEY_NAME}=${key}\n`

if (existsSync(envPath)) {
  const existing = readFileSync(envPath, 'utf8')
  const stripped = existing.replace(new RegExp(`^${KEY_NAME}=.*$`, 'm'), '').trimEnd()
  writeFileSync(envPath, `${stripped}\n${line}`, { mode: 0o600 })
} else {
  writeFileSync(envPath, line, { mode: 0o600 })
}

console.log(`Master key written to ${envPath}.`)
console.log('\nWhen you deploy to Fly, set the SAME value as a Fly secret:')
console.log('  fly secrets set MASTER_KEY=<paste the value from .env.local>')
console.log('\nLosing this key means every stored follower signer becomes permanently')
console.log('unreadable — back it up somewhere safe, separate from this machine.')
