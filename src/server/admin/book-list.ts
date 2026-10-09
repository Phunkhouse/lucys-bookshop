import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
import type { AdminActor } from '@/server/auth/require-admin'
import { displayStatus } from '@/server/availability'
import { isAvailableSql, isReservedSql } from '@/server/availability-sql'
import { db } from '@/server/db/client'
import { bookImages, books } from '@/server/db/schema'
import type { StatusFilter } from './status-filter'

export type AdminBookItem = {
  id: string
  shortId: string
  title: string
  author: string
  priceMinor: number
  currency: string
  // What a visitor would see: an expired reservation counts as available.
  status: 'available' | 'reserved' | 'sold' | 'hidden'
  // Last change of any kind, not only of the status (see spec 6.9).
  updatedAt: Date
  photoCount: number
}

export type AdminBookList = {
  items: AdminBookItem[]
  counts: Record<StatusFilter, number>
}

function filterSql(status: StatusFilter, now: Date): SQL | undefined {
  switch (status) {
    case 'all':
      return undefined
    case 'available':
      return isAvailableSql(now)
    case 'reserved':
      return isReservedSql(now)
    case 'sold':
    case 'hidden':
      return eq(books.status, status)
  }
}

export async function listAdminBooks(
  _actor: AdminActor,
  { status, now }: { status: StatusFilter; now: Date },
): Promise<AdminBookList> {
  const rows = await db
    .select({
      id: books.id,
      shortId: books.shortId,
      title: books.title,
      author: books.author,
      priceMinor: books.priceMinor,
      currency: books.currency,
      stored: books.status,
      reservedUntil: books.reservedUntil,
      soldAt: books.soldAt,
      updatedAt: books.updatedAt,
      photoCount: sql<number>`(select count(*)::int from ${bookImages} where ${bookImages.bookId} = ${books.id})`,
    })
    .from(books)
    .where(and(filterSql(status, now)))
    .orderBy(desc(books.createdAt), asc(books.id))

  const [counted] = await db
    .select({
      all: sql<number>`count(*)::int`,
      available: sql<number>`(count(*) filter (where ${isAvailableSql(now)}))::int`,
      reserved: sql<number>`(count(*) filter (where ${isReservedSql(now)}))::int`,
      sold: sql<number>`(count(*) filter (where ${books.status} = 'sold'))::int`,
      hidden: sql<number>`(count(*) filter (where ${books.status} = 'hidden'))::int`,
    })
    .from(books)

  return {
    items: rows.map(({ stored, reservedUntil, soldAt, ...row }) => ({
      ...row,
      status: displayStatus({ status: stored, reservedUntil, soldAt }, now),
    })),
    counts: counted,
  }
}
