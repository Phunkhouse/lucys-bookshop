import 'dotenv/config'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { isBackupKey, latestBackupKey } from '../src/server/backup/backup-key'
import { restoreBackup } from '../src/server/backup/restore'
import { assertSafeRestoreTarget } from '../src/server/backup/restore-target'

// Restores a backup from the private R2 bucket into an empty database. The
// runbook, with every step, is docs/backup.md.
const USAGE = `Usage: pnpm backup:restore --identity <age key file> --target <database url> [--key <object key>] [--allow-remote]

Needs in .env: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
Without --key the newest backup is used.`

function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set (see docs/backup.md).`)
  return value
}

async function main() {
  const { values } = parseArgs({
    options: {
      identity: { type: 'string' },
      target: { type: 'string' },
      key: { type: 'string' },
      'allow-remote': { type: 'boolean', default: false },
    },
  })
  if (!values.identity || !values.target) {
    console.error(USAGE)
    process.exit(2)
  }

  assertSafeRestoreTarget(values.target, {
    allowRemote: values['allow-remote'],
    protectedUrls: [
      process.env.DATABASE_URL,
      process.env.MIGRATION_DATABASE_URL,
      process.env.BACKUP_DATABASE_URL,
    ],
  })

  const bucket = need('R2_BUCKET')
  const s3 = new S3Client({
    // The bucket is in the EU jurisdiction, which has its own address.
    endpoint: `https://${need('R2_ACCOUNT_ID')}.eu.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: need('R2_ACCESS_KEY_ID'),
      secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  let key = values.key
  if (key === undefined) {
    const keys: string[] = []
    let token: string | undefined
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'daily/',
          ContinuationToken: token,
        }),
      )
      keys.push(...(page.Contents ?? []).flatMap((o) => (o.Key ? [o.Key] : [])))
      token = page.NextContinuationToken
    } while (token)
    key = latestBackupKey(keys) ?? undefined
    if (key === undefined) throw new Error('The bucket holds no backup yet.')
  } else if (!isBackupKey(key)) {
    throw new Error(`"${key}" is not the name of a backup.`)
  }
  console.log(`Backup: ${key}`)

  // 0700: the directory briefly holds the downloaded and decrypted copies.
  const workDir = mkdtempSync(join(tmpdir(), 'bookshop-restore-'))
  try {
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    )
    const ciphertextPath = join(workDir, 'backup.dump.age')
    await writeFile(ciphertextPath, await object.Body!.transformToByteArray(), {
      mode: 0o600,
    })
    console.log('Downloaded. Decrypting and restoring…')
    await restoreBackup({
      ciphertextPath,
      identityPath: values.identity,
      targetUrl: values.target,
      workDir,
    })
    console.log('Restored.')
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
