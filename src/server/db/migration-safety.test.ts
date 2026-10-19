import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findRiskyStatements } from './migration-safety'

// While a production build runs, the old code keeps serving against the
// already migrated database (ADR 0019). A migration must therefore be one the
// old code survives: it may add, never remove or tighten.

describe('findRiskyStatements: what is safe', () => {
  it.each([
    'CREATE TABLE "x" ("id" uuid PRIMARY KEY, "name" text NOT NULL);',
    'ALTER TABLE "orders" ADD COLUMN "seller_notified_at" timestamp with time zone;',
    'ALTER TABLE "orders" ADD COLUMN "n" integer NOT NULL DEFAULT 0;',
    'ALTER TABLE "orders" ADD COLUMN "n" integer DEFAULT 0 NOT NULL;',
    'CREATE INDEX "i" ON "orders" ("status");',
    'CREATE UNIQUE INDEX "u" ON "orders" ("number");',
    'ALTER TABLE "orders" ADD CONSTRAINT "c" CHECK ("total" >= 0);',
    'ALTER TABLE "orders" ALTER COLUMN "note" DROP NOT NULL;',
    'ALTER TABLE "orders" DROP CONSTRAINT "c";',
    'DROP INDEX "i";',
    'UPDATE "orders" SET "a" = "b" WHERE "a" IS NULL;',
    'INSERT INTO "t" ("a") VALUES (1) ON CONFLICT DO NOTHING;',
  ])('accepts %s', (sql) => {
    expect(findRiskyStatements(sql)).toEqual([])
  })
})

describe('findRiskyStatements: what is not', () => {
  it.each([
    ['dropping a column', 'ALTER TABLE "orders" DROP COLUMN "note";'],
    ['dropping a table', 'DROP TABLE "orders";'],
    ['dropping a table if it exists', 'DROP TABLE IF EXISTS "orders" CASCADE;'],
    ['dropping a schema', 'DROP SCHEMA "x" CASCADE;'],
    ['dropping a type', 'DROP TYPE "order_status";'],
    ['renaming a column', 'ALTER TABLE "orders" RENAME COLUMN "a" TO "b";'],
    ['renaming a table', 'ALTER TABLE "orders" RENAME TO "purchases";'],
    [
      'making a column required',
      'ALTER TABLE "orders" ALTER COLUMN "note" SET NOT NULL;',
    ],
    [
      'changing a column type',
      'ALTER TABLE "orders" ALTER COLUMN "n" SET DATA TYPE bigint;',
    ],
    [
      'changing a column type, short form',
      'ALTER TABLE "orders" ALTER COLUMN "n" TYPE bigint;',
    ],
    [
      'adding a required column with no default',
      'ALTER TABLE "orders" ADD COLUMN "n" integer NOT NULL;',
    ],
    ['emptying a table', 'TRUNCATE TABLE "orders";'],
    ['emptying a table, short form', 'TRUNCATE "orders";'],
    ['deleting rows', 'DELETE FROM "orders" WHERE "status" = \'cancelled\';'],
  ])('flags %s', (_label, sql) => {
    expect(findRiskyStatements(sql)).toHaveLength(1)
  })

  it('does not mind the letter case or the line breaks', () => {
    expect(
      findRiskyStatements('alter table "orders"\n  drop\n  column "note";'),
    ).toHaveLength(1)
    expect(
      findRiskyStatements(
        'Alter Table "orders"\n\tAlter Column "n"\n\tSet   Not Null;',
      ),
    ).toHaveLength(1)
  })

  it('finds each risky statement among safe ones, split like drizzle writes them', () => {
    const sql = [
      'ALTER TABLE "orders" ADD COLUMN "a" text;',
      '--> statement-breakpoint',
      'ALTER TABLE "orders" DROP COLUMN "b";',
      '--> statement-breakpoint',
      'CREATE INDEX "i" ON "orders" ("a");',
      '--> statement-breakpoint',
      'DROP TABLE "old";',
    ].join('\n')

    const risky = findRiskyStatements(sql)

    expect(risky).toHaveLength(2)
    expect(risky[0]).toContain('DROP COLUMN')
    expect(risky[1]).toContain('DROP TABLE')
  })

  it('ignores a risky word inside a comment', () => {
    expect(
      findRiskyStatements(
        '-- we will DROP COLUMN "x" in a later migration\nALTER TABLE "o" ADD COLUMN "y" text;',
      ),
    ).toEqual([])
  })
})

// A semicolon or two dashes inside a string are data, not syntax. Treating them as
// syntax could hide a risky statement behind them.
describe('findRiskyStatements: string literals', () => {
  it('finds a risky statement after a string that contains a semicolon', () => {
    const sql = `INSERT INTO "t" ("a") VALUES ('x;y');\nALTER TABLE "t" DROP COLUMN "b";`

    expect(findRiskyStatements(sql)).toHaveLength(1)
  })

  it('finds a risky statement after a string that contains two dashes', () => {
    // On one line: stripping "comments" first would swallow the rest of it.
    const sql = `UPDATE "t" SET "a" = 'x -- y'; DROP TABLE "z";`

    expect(findRiskyStatements(sql)).toHaveLength(1)
  })

  it('handles an escaped quote inside a string', () => {
    const sql = `UPDATE "t" SET "a" = 'it''s; fine';\nDROP TABLE "z";`

    expect(findRiskyStatements(sql)).toHaveLength(1)
  })

  it('does not take a risky word inside a string for a statement', () => {
    expect(
      findRiskyStatements(`UPDATE "t" SET "a" = 'please DROP COLUMN later';`),
    ).toEqual([])
    expect(
      findRiskyStatements(`INSERT INTO "t" ("a") VALUES ('rename; truncate');`),
    ).toEqual([])
  })

  it('does not take an apostrophe inside a comment for a string', () => {
    const sql = `-- it's a comment with an apostrophe\nALTER TABLE "t" DROP COLUMN "b";`

    expect(findRiskyStatements(sql)).toHaveLength(1)
  })
})

describe('findRiskyStatements: the explicit marker', () => {
  const risky = 'ALTER TABLE "orders" DROP COLUMN "note";'

  it('accepts a risky migration that says why', () => {
    expect(
      findRiskyStatements(
        `-- allow-destructive: nothing has read note since PR 123\n${risky}`,
      ),
    ).toEqual([])
  })

  it('wants a reason, not just the marker', () => {
    expect(findRiskyStatements(`-- allow-destructive:\n${risky}`)).toHaveLength(
      1,
    )
    expect(
      findRiskyStatements(`-- allow-destructive:    \n${risky}`),
    ).toHaveLength(1)
    expect(findRiskyStatements(`-- allow-destructive\n${risky}`)).toHaveLength(
      1,
    )
  })

  it('wants the marker as a comment of its own', () => {
    expect(
      findRiskyStatements(`${risky} allow-destructive: because`),
    ).toHaveLength(1)
  })
})

describe('the real migrations', () => {
  it('are all safe for the old code to run against', () => {
    const folder = join(process.cwd(), 'drizzle')
    const problems: string[] = []
    for (const name of readdirSync(folder)) {
      let sql: string
      try {
        sql = readFileSync(join(folder, name, 'migration.sql'), 'utf8')
      } catch {
        continue
      }
      for (const statement of findRiskyStatements(sql)) {
        problems.push(`${name}: ${statement}`)
      }
    }

    expect(problems).toEqual([])
  })
})
