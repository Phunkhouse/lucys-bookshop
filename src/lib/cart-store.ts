import { cartInputSchema, MAX_CART_ITEMS, type CartInput } from './cart-schema'

export type CartItem = CartInput[number]

// Where the cart lives in the browser. The version lets a later change of the
// stored shape tell old carts apart.
export const CART_STORAGE_KEY = 'cart.v1'

// The part of Storage the cart uses (a test passes a fake).
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const itemSchema = cartInputSchema.element

// Reads whatever is stored. A cart is a convenience, never worth an error:
// anything unreadable gives an empty cart, and single broken items are dropped.
export function parseStoredCart(raw: string | null): CartItem[] {
  if (raw === null) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  const list = (data as { v?: unknown; items?: unknown } | null)?.items
  if ((data as { v?: unknown } | null)?.v !== 1 || !Array.isArray(list)) {
    return []
  }

  const items: CartItem[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    const parsed = itemSchema.safeParse(entry)
    if (!parsed.success || seen.has(parsed.data.shortId)) continue
    seen.add(parsed.data.shortId)
    items.push(parsed.data)
    if (items.length === MAX_CART_ITEMS) break
  }
  return items
}

export type AddResult = 'added' | 'already_in_cart' | 'cart_full'

export const EMPTY_CART: CartItem[] = []

// The cart as a small external store (for useSyncExternalStore). It keeps only
// which books and the price the buyer saw, never a total: the server works out
// every price again (spec 6.3).
//
// `subscribeExternal` reports changes made elsewhere, such as another tab.
// If the browser refuses storage (private mode, blocked site data), the cart
// still works until the page is closed.
export function createCartStore(
  storage: StorageLike | null,
  subscribeExternal?: (onChange: () => void) => () => void,
) {
  let storageBroken = storage === null
  let memoryRaw: string | null = null
  let cache: { raw: string | null; items: CartItem[] } = {
    raw: null,
    items: EMPTY_CART,
  }
  const listeners = new Set<() => void>()
  let stopExternal: (() => void) | null = null

  function readRaw(): string | null {
    if (!storageBroken && storage) {
      try {
        return storage.getItem(CART_STORAGE_KEY)
      } catch {
        storageBroken = true
      }
    }
    return memoryRaw
  }

  function writeRaw(raw: string) {
    memoryRaw = raw
    if (storageBroken || !storage) return
    try {
      storage.setItem(CART_STORAGE_KEY, raw)
    } catch {
      storageBroken = true
    }
  }

  // The same array for as long as the stored text is the same, as
  // useSyncExternalStore requires.
  function getSnapshot(): CartItem[] {
    const raw = readRaw()
    if (raw !== cache.raw) {
      const items = parseStoredCart(raw)
      cache = { raw, items: items.length === 0 ? EMPTY_CART : items }
    }
    return cache.items
  }

  function notify() {
    for (const listener of [...listeners]) listener()
  }

  function save(items: CartItem[]) {
    writeRaw(JSON.stringify({ v: 1, items }))
    notify()
  }

  function subscribe(listener: () => void) {
    listeners.add(listener)
    if (listeners.size === 1 && subscribeExternal) {
      stopExternal = subscribeExternal(notify)
    }
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && stopExternal) {
        stopExternal()
        stopExternal = null
      }
    }
  }

  function add(item: CartItem): AddResult {
    const items = getSnapshot()
    if (items.some((entry) => entry.shortId === item.shortId)) {
      return 'already_in_cart'
    }
    if (items.length >= MAX_CART_ITEMS) return 'cart_full'
    save([...items, item])
    return 'added'
  }

  function remove(shortId: string) {
    const items = getSnapshot()
    if (!items.some((entry) => entry.shortId === shortId)) return
    save(items.filter((entry) => entry.shortId !== shortId))
  }

  // The buyer accepted a new price: remember it as the price they have seen.
  function acceptPrice(shortId: string, priceMinorSeen: number) {
    const items = getSnapshot()
    if (!items.some((entry) => entry.shortId === shortId)) return
    save(
      items.map((entry) =>
        entry.shortId === shortId ? { ...entry, priceMinorSeen } : entry,
      ),
    )
  }

  function clear() {
    if (getSnapshot().length === 0) return
    save([])
  }

  return { getSnapshot, subscribe, add, remove, acceptPrice, clear }
}

export type CartStore = ReturnType<typeof createCartStore>
