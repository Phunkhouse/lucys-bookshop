import { spawn } from 'node:child_process'
import { closeSync, openSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'
import { forContainer } from './restore-target'

// Newest client: pg_dump can read any server up to its own version, so one image
// serves every Neon version. Same tag as docker-compose.yml and CI.
export const POSTGRES_IMAGE = 'postgres:18'

type Stdio = { stdin?: number; stdout?: number }

function run(
  command: string,
  args: string[],
  env: Record<string, string> = {},
  stdio: Stdio = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Addresses and passwords travel in `env`, never in `args`, so they stay out
    // of the process list and out of error messages.
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: [stdio.stdin ?? 'ignore', stdio.stdout ?? 'ignore', 'pipe'],
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    child.on('error', (error) =>
      reject(new Error(`${command} could not start: ${error.message}`)),
    )
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`)),
    )
  })
}

// Runs a Postgres tool from the pinned image. The address is passed as an
// environment variable and the shell inside the container expands it.
function postgresTool(script: string, address: string, stdio: Stdio) {
  return run(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-e',
      'DB_URL',
      POSTGRES_IMAGE,
      'sh',
      '-c',
      script,
    ],
    { DB_URL: forContainer(address) },
    stdio,
  )
}

// A compressed dump of the whole database, the same call the backup workflow makes.
export async function dumpDatabase(options: {
  databaseUrl: string
  outputPath: string
}): Promise<void> {
  const out = openSync(options.outputPath, 'w', 0o600)
  try {
    await postgresTool(
      'pg_dump --format=custom --no-owner --no-privileges "$DB_URL"',
      options.databaseUrl,
      { stdout: out },
    )
  } finally {
    closeSync(out)
  }
}

// A restore into a database that already has tables would stop halfway and leave
// a mix of old and restored data, so it is refused before anything is written.
export async function assertEmptyDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_class c
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
          AND ns.nspname NOT LIKE 'pg_toast%'`,
    )
    if (rows[0]!.n > 0) {
      throw new Error(
        `The target database already has ${rows[0]!.n} table(s). Restore into a new, empty database.`,
      )
    }
  } finally {
    await pool.end()
  }
}

// Decrypts a backup with the private key and restores it into an empty database.
// The decrypted dump exists only for the duration of the call.
export async function restoreBackup(options: {
  ciphertextPath: string
  identityPath: string
  targetUrl: string
  workDir: string
}): Promise<void> {
  await assertEmptyDatabase(options.targetUrl)
  const plainPath = join(options.workDir, 'restore.dump')
  try {
    await run('age', [
      '--decrypt',
      '--identity',
      options.identityPath,
      '--output',
      plainPath,
      options.ciphertextPath,
    ])
    const input = openSync(plainPath, 'r')
    try {
      await postgresTool(
        'pg_restore --no-owner --no-privileges --exit-on-error --dbname "$DB_URL"',
        options.targetUrl,
        { stdin: input },
      )
    } finally {
      closeSync(input)
    }
  } finally {
    rmSync(plainPath, { force: true })
  }
}
