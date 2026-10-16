import 'dotenv/config' // must stay first: loads .env so a local run finds DATABASE_URL
import { randomBytes } from 'node:crypto'
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import type { TestProject } from 'vitest/node'

// Tests create and drop databases, so only ever do that on a local server.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string
    testStorage: {
      endpoint: string
      bucket: string
      accessKeyId: string
      secretAccessKey: string
      region: string
      forcePathStyle: boolean
    }
  }
}

// The storage tests create and empty a bucket, so only ever do that on a local
// server, never on the real storage the settings might point at.
function localStorageConfig() {
  const {
    STORAGE_ENDPOINT: endpoint,
    STORAGE_ACCESS_KEY_ID: accessKeyId,
    STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
  } = process.env
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'The STORAGE_* settings are not set. Copy them from .env.example into .env and run pnpm db:up.',
    )
  }
  const host = new URL(endpoint).hostname
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(
      `Refusing to create a test bucket on ${host}: only a local storage server is allowed.`,
    )
  }
  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    // The local server needs path-style addresses.
    forcePathStyle: true,
  }
}

// Creates a throwaway database on the server DATABASE_URL points at, applies the
// real migrations to it, and drops it when the run ends (see ADR 0010).
export default async function setup(project: TestProject) {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl)
    throw new Error('DATABASE_URL is not set. Run pnpm db:up first.')

  const url = new URL(baseUrl)
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error(
      `Refusing to create a test database on ${url.hostname}: only a local server is allowed.`,
    )
  }

  const name = `bookshop_test_${randomBytes(4).toString('hex')}`
  const admin = new Pool({ connectionString: baseUrl, max: 1 })
  await admin.query(`CREATE DATABASE ${name}`)

  const testUrl = new URL(baseUrl)
  testUrl.pathname = `/${name}`

  const pool = new Pool({ connectionString: testUrl.toString(), max: 1 })
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }

  project.provide('testDatabaseUrl', testUrl.toString())

  // A throwaway bucket on the local S3-compatible server, like the database.
  const storage = localStorageConfig()
  const bucket = `bookshop-test-${randomBytes(4).toString('hex')}`
  const s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  await s3.send(new CreateBucketCommand({ Bucket: bucket }))
  project.provide('testStorage', { ...storage, bucket })

  return async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await admin.end()

    const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }))
    const objects = (listed.Contents ?? []).map(({ Key }) => ({ Key }))
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }),
      )
    }
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }))
  }
}
