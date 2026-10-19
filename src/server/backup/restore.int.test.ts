import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { dumpDatabase, restoreBackup } from './restore'

// The restore drill (docs/backup.md): dump a database the way the workflow does,
// encrypt it with a fresh key, then restore it into an empty database with the
// same code the restore script uses. Needs `age` and Docker on the machine.
const baseUrl = inject('testDatabaseUrl')
const admin = new URL(baseUrl)
admin.pathname = '/postgres'

let dir: string
let adminPool: Pool
const created: string[] = []

function urlFor(name: string): string {
  const url = new URL(baseUrl)
  url.pathname = `/${name}`
  return url.toString()
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'restore-drill-'))
  adminPool = new Pool({ connectionString: admin.toString(), max: 1 })
})

afterAll(async () => {
  for (const name of created) {
    await adminPool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  }
  await adminPool.end()
  rmSync(dir, { recursive: true, force: true })
})

describe('restoreBackup', () => {
  it('brings back what was dumped, through encryption', async () => {
    const source = `drill_source_${Date.now()}`
    const target = `drill_target_${Date.now()}`
    created.push(source, target)
    await adminPool.query(`CREATE DATABASE ${source}`)
    await adminPool.query(`CREATE DATABASE ${target}`)

    const sourcePool = new Pool({ connectionString: urlFor(source), max: 1 })
    await sourcePool.query(
      `CREATE TABLE books (id serial PRIMARY KEY, title text NOT NULL)`,
    )
    await sourcePool.query(
      `INSERT INTO books (title) VALUES ('Alpha'), ('Beta'), ('Gamma')`,
    )
    await sourcePool.end()

    // A throwaway key pair, so the test holds the private key like the seller does.
    const identityPath = join(dir, 'key.txt')
    execFileSync('age-keygen', ['-o', identityPath], { stdio: 'pipe' })
    const publicKey = execFileSync('age-keygen', ['-y', identityPath])
      .toString()
      .trim()

    const dumpPath = join(dir, 'dump')
    await dumpDatabase({ databaseUrl: urlFor(source), outputPath: dumpPath })
    const ciphertextPath = join(dir, 'dump.age')
    execFileSync('age', ['-r', publicKey, '-o', ciphertextPath, dumpPath])

    // The encrypted file must not contain the data in the clear.
    expect(readFileSync(ciphertextPath).includes('Alpha')).toBe(false)

    await restoreBackup({
      ciphertextPath,
      identityPath,
      targetUrl: urlFor(target),
      workDir: dir,
    })

    const targetPool = new Pool({ connectionString: urlFor(target), max: 1 })
    try {
      const { rows } = await targetPool.query(
        'SELECT title FROM books ORDER BY id',
      )
      expect(rows.map((row) => row.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
    } finally {
      await targetPool.end()
    }
  }, 120_000)

  it('fails, and writes nothing, with the wrong key', async () => {
    const target = `drill_wrong_${Date.now()}`
    created.push(target)
    await adminPool.query(`CREATE DATABASE ${target}`)

    const rightIdentity = join(dir, 'right.txt')
    const wrongIdentity = join(dir, 'wrong.txt')
    execFileSync('age-keygen', ['-o', rightIdentity], { stdio: 'pipe' })
    execFileSync('age-keygen', ['-o', wrongIdentity], { stdio: 'pipe' })
    const publicKey = execFileSync('age-keygen', ['-y', rightIdentity])
      .toString()
      .trim()
    const plain = join(dir, 'plain')
    writeFileSync(plain, 'not a dump')
    const ciphertextPath = join(dir, 'plain.age')
    execFileSync('age', ['-r', publicKey, '-o', ciphertextPath, plain])

    await expect(
      restoreBackup({
        ciphertextPath,
        identityPath: wrongIdentity,
        targetUrl: urlFor(target),
        workDir: dir,
      }),
    ).rejects.toThrow()

    const targetPool = new Pool({ connectionString: urlFor(target), max: 1 })
    try {
      const { rows } = await targetPool.query(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
      )
      expect(rows[0].n).toBe(0)
    } finally {
      await targetPool.end()
    }
  }, 120_000)
})
