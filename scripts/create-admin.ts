import 'dotenv/config' // must stay first: loads .env before anything reads the env
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { z } from 'zod'
import { env } from '../src/config/env'
import { createAdmin } from '../src/server/auth/create-admin'
import { createAuth } from '../src/server/auth/create-auth'
import { db, pool } from '../src/server/db/client'

// Usage: pnpm admin:create <email> <name>
// The password is asked for on the terminal (hidden), so it never lands in
// shell history or the process list. One reader serves both prompts, so
// piped input works too.
let muted = false
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!muted) process.stdout.write(chunk)
    done()
  },
})
const reader = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
})
const lines = reader[Symbol.asyncIterator]()

async function askPassword(prompt: string) {
  process.stdout.write(prompt)
  muted = true
  const { value, done } = await lines.next()
  muted = false
  process.stdout.write('\n')
  if (done) throw new Error('No password was entered.')
  return String(value)
}

async function main() {
  const [email, name] = process.argv.slice(2)
  if (!email || !name) {
    console.error('Usage: pnpm admin:create <email> <name>')
    process.exitCode = 1
    return
  }

  const password = await askPassword('Password (min 12 characters): ')
  const repeat = await askPassword('Repeat password: ')
  if (password !== repeat) {
    console.error('Passwords do not match.')
    process.exitCode = 1
    return
  }

  const auth = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
  })
  const created = await createAdmin(auth, { name, email, password })
  console.log(`Created admin ${created.email}`)
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof z.ZodError
        ? z.prettifyError(error)
        : error instanceof Error
          ? error.message
          : error,
    )
    process.exitCode = 1
  })
  .finally(async () => {
    reader.close()
    await pool.end()
  })
