import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import type { AdminActor } from '@/server/auth/require-admin'
import { db } from '@/server/db/client'
import { orderItems, orders } from '@/server/db/schema'
import {
  isExpiringSoon,
  orderStage,
  type OrderStage,
} from '@/server/order-stage'
import type { StageFilter } from './order-filter'

export type AdminOrderItem = {
  id: string
  number: number
  name: string
  // An unpaid order past its deadline is 'expired' (nothing is written).
  stage: OrderStage
  expiringSoon: boolean
  paymentMethod: 'bank_transfer' | 'cash_on_pickup'
  shippingMethod: 'pickup' | 'zasilkovna'
  totalMinor: number
  currency: string
  bookCount: number
  createdAt: Date
}

export type AdminOrderList = {
  items: AdminOrderItem[]
  counts: Record<StageFilter, number>
}

// The same rules as orderStage, as SQL. Both must give the same answer for
// every order; the integration test compares the counts with the rows.
function awaitingSql(now: Date): SQL {
  return and(eq(orders.status, 'pending_payment'), gte(orders.expiresAt, now))!
}
function expiredSql(now: Date): SQL {
  return and(eq(orders.status, 'pending_payment'), lt(orders.expiresAt, now))!
}

function filterSql(stage: StageFilter, now: Date): SQL | undefined {
  switch (stage) {
    case 'all':
      return undefined
    case 'awaiting_payment':
      return awaitingSql(now)
    case 'expired':
      return expiredSql(now)
    default:
      return eq(orders.status, stage)
  }
}

export async function listAdminOrders(
  _actor: AdminActor,
  { stage, now }: { stage: StageFilter; now: Date },
): Promise<AdminOrderList> {
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      name: orders.name,
      status: orders.status,
      expiresAt: orders.expiresAt,
      paymentMethod: orders.paymentMethod,
      shippingMethod: orders.shippingMethod,
      totalMinor: orders.totalMinor,
      currency: orders.currency,
      createdAt: orders.createdAt,
      // "orders"."id" is spelled out below: in a one-table select Drizzle renders
      // ${orders.id} as a bare "id", which the subquery would read as its own.
      bookCount: sql<number>`(select count(*)::int from ${orderItems} where ${orderItems.orderId} = "orders"."id")`,
    })
    .from(orders)
    .where(filterSql(stage, now))
    .orderBy(desc(orders.createdAt), desc(orders.number))

  const [counted] = await db
    .select({
      all: sql<number>`count(*)::int`,
      awaiting_payment: sql<number>`(count(*) filter (where ${awaitingSql(now)}))::int`,
      expired: sql<number>`(count(*) filter (where ${expiredSql(now)}))::int`,
      paid: sql<number>`(count(*) filter (where ${orders.status} = 'paid'))::int`,
      shipped: sql<number>`(count(*) filter (where ${orders.status} = 'shipped'))::int`,
      completed: sql<number>`(count(*) filter (where ${orders.status} = 'completed'))::int`,
      cancelled: sql<number>`(count(*) filter (where ${orders.status} = 'cancelled'))::int`,
      refunded: sql<number>`(count(*) filter (where ${orders.status} = 'refunded'))::int`,
    })
    .from(orders)

  return {
    items: rows.map(({ status, expiresAt, ...row }) => {
      const stageNow = orderStage(status, expiresAt, now)
      return {
        ...row,
        stage: stageNow,
        expiringSoon: isExpiringSoon(stageNow, expiresAt, now),
      }
    }),
    counts: counted,
  }
}
