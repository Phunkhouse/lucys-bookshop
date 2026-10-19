import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.schema'

const valid = {
  DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3000',
  STORAGE_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
  STORAGE_BUCKET: 'lucys-bookshop',
  STORAGE_ACCESS_KEY_ID: 'AKIAEXAMPLE',
  STORAGE_SECRET_ACCESS_KEY: 'secret-for-the-test',
  IMAGE_BASE_URL: 'https://pub-abc123.r2.dev',
}

describe('BACKUP_REPORT_SECRET', () => {
  it('is optional: without it the report endpoint and the warning are off', () => {
    expect(parseEnv(valid).BACKUP_REPORT_SECRET).toBeUndefined()
    expect(
      parseEnv({ ...valid, BACKUP_REPORT_SECRET: '' }).BACKUP_REPORT_SECRET,
    ).toBeUndefined()
    expect(
      parseEnv({ ...valid, BACKUP_REPORT_SECRET: ' \n ' }).BACKUP_REPORT_SECRET,
    ).toBeUndefined()
  })

  it('accepts 32 characters or more and ignores whitespace around it', () => {
    const secret = 'b'.repeat(32)
    expect(
      parseEnv({ ...valid, BACKUP_REPORT_SECRET: `  ${secret}\n` })
        .BACKUP_REPORT_SECRET,
    ).toBe(secret)
  })

  it('refuses a short one, without putting it into the error', () => {
    const short = 'too-short-backup-secret'
    expect(() => parseEnv({ ...valid, BACKUP_REPORT_SECRET: short })).toThrow(
      /BACKUP_REPORT_SECRET/,
    )
    try {
      parseEnv({ ...valid, BACKUP_REPORT_SECRET: short })
    } catch (error) {
      expect(String(error)).not.toContain(short)
    }
  })

  it('is independent of JOBS_SECRET', () => {
    const jobs = 'j'.repeat(32)
    const parsed = parseEnv({ ...valid, JOBS_SECRET: jobs })
    expect(parsed.JOBS_SECRET).toBe(jobs)
    expect(parsed.BACKUP_REPORT_SECRET).toBeUndefined()
  })
})
