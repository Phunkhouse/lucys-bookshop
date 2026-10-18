'use client'

import { useSyncExternalStore } from 'react'
import {
  CART_STORAGE_KEY,
  createCartStore,
  EMPTY_CART,
  type CartStore,
} from './cart-store'

// One store for the whole page, created in the browser on first use.
let browserStore: CartStore | undefined

function getStore(): CartStore {
  if (!browserStore) {
    let storage: Storage | null = null
    try {
      storage = window.localStorage
    } catch {
      // Blocked site data: the cart then lives only until the page closes.
    }
    browserStore = createCartStore(storage, (onChange) => {
      // Fires in the other tabs when this one saves.
      const listener = (event: StorageEvent) => {
        if (event.key === null || event.key === CART_STORAGE_KEY) onChange()
      }
      window.addEventListener('storage', listener)
      return () => window.removeEventListener('storage', listener)
    })
  }
  return browserStore
}

const subscribe = (listener: () => void) => getStore().subscribe(listener)
const getSnapshot = () => getStore().getSnapshot()
// The server (and the first client render) has no cart: it is empty until the
// browser's storage has been read.
const getServerSnapshot = () => EMPTY_CART

export function useCart() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    items,
    add: (item: (typeof items)[number]) => getStore().add(item),
    remove: (shortId: string) => getStore().remove(shortId),
    acceptPrice: (shortId: string, priceMinorSeen: number) =>
      getStore().acceptPrice(shortId, priceMinorSeen),
  }
}
