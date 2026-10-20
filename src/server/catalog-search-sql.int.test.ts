import { sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db/client'
import { createBook, resetDatabase } from './db/test-helpers'

// The search text the index and the (coming) search query share, ADR 0022.
async function searchText(title: string, author: string, isbn: string | null) {
  const { rows } = await db.execute<{ text: string }>(
    sql`SELECT catalog_search_text(${title}, ${author}, ${isbn}) AS text`,
  )
  return rows[0].text
}

describe('catalog_search_text', () => {
  it('lowercases and strips Czech diacritics', async () => {
    expect(await searchText('Válka s mloky', 'Karel Čapek', null)).toBe(
      'valka s mloky karel capek ',
    )
  })

  it('includes the ISBN and treats a missing one as empty', async () => {
    expect(await searchText('A', 'B', '9788074735615')).toBe(
      'a b 9788074735615',
    )
  })

  it('matches text typed without accents', async () => {
    const { rows } = await db.execute<{ similar: boolean }>(
      sql`SELECT catalog_search_text('Příliš žluťoučký kůň', 'Jan Novák', null) ILIKE '%zlutoucky kun%' AS similar`,
    )
    expect(rows[0].similar).toBe(true)
  })
})

describe('books_search_trgm_idx', () => {
  beforeEach(resetDatabase)

  it('exists and the planner can use it', async () => {
    await createBook({ title: 'Válka s mloky', author: 'Karel Čapek' })
    await db.execute(sql`SET enable_seqscan = off`)
    const { rows } = await db.execute<{ 'QUERY PLAN': string }>(
      sql`EXPLAIN SELECT 1 FROM books WHERE catalog_search_text(title, author, isbn) ILIKE '%capek%'`,
    )
    await db.execute(sql`RESET enable_seqscan`)
    expect(rows.map((r) => r['QUERY PLAN']).join('\n')).toContain(
      'books_search_trgm_idx',
    )
  })
})
