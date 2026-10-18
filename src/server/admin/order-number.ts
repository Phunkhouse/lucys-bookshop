const MAX_ORDER_NUMBER = 2147483647

// The order number from the address (/admin/orders/20260007). It is typed by
// hand or tampered with, so only plain ASCII digits that fit the database
// column pass. Anything else is a 404 before any query runs.
export function parseOrderNumber(value: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(value)) return null
  const number = Number(value)
  return number <= MAX_ORDER_NUMBER ? number : null
}
