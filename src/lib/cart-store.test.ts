import { describe, expect, it, vi } from 'vitest'
import { MAX_CART_ITEMS } from './cart-schema'
import {
  CART_STORAGE_KEY,
  createCartStore,
  parseStoredCart,
  type StorageLike,
} from './cart-store'

const a = { shortId: 'aaaaaa11', priceMinorSeen: 10000 }
const b = { shortId: 'bbbbbb22', priceMinorSeen: 20000 }

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  const storage: StorageLike = {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
  return { storage, data }
}

const stored = (items: unknown[], v: number = 1) => JSON.stringify({ v, items })

describe('parseStoredCart', () => {
  it('reads a saved cart', () => {
    expect(parseStoredCart(stored([a, b]))).toEqual([a, b])
  })

  it.each([
    ['nothing stored', null],
    ['text that is not JSON', '{oops'],
    ['JSON of another shape', '[1,2,3]'],
    ['an unknown version', stored([a], 2)],
    ['no list of items', JSON.stringify({ v: 1 })],
    ['null', 'null'],
  ])('gives an empty cart for %s', (_name, raw) => {
    expect(parseStoredCart(raw)).toEqual([])
  })

  it('drops broken and repeated items and keeps the rest', () => {
    const raw = stored([
      a,
      { shortId: 'NOPE', priceMinorSeen: 1 },
      { shortId: 'cccccc33', priceMinorSeen: -5 },
      'text',
      null,
      { ...a, priceMinorSeen: 999 },
      b,
    ])
    expect(parseStoredCart(raw)).toEqual([a, b])
  })

  it('keeps at most the cart limit', () => {
    const many = Array.from({ length: MAX_CART_ITEMS + 5 }, (_, i) => ({
      shortId: `b${String(i).padStart(7, '0')}`,
      priceMinorSeen: 1,
    }))
    expect(parseStoredCart(stored(many))).toHaveLength(MAX_CART_ITEMS)
  })
})

describe('cart store', () => {
  it('starts empty and adds a book once', () => {
    const { storage } = fakeStorage()
    const store = createCartStore(storage)

    expect(store.getSnapshot()).toEqual([])
    expect(store.add(a)).toBe('added')
    expect(store.add({ ...a, priceMinorSeen: 5 })).toBe('already_in_cart')
    expect(store.getSnapshot()).toEqual([a])
  })

  it('keeps the books in the order they were added', () => {
    const store = createCartStore(fakeStorage().storage)
    store.add(b)
    store.add(a)
    expect(store.getSnapshot().map((i) => i.shortId)).toEqual([
      'bbbbbb22',
      'aaaaaa11',
    ])
  })

  it('refuses a book over the limit', () => {
    const store = createCartStore(fakeStorage().storage)
    for (let i = 0; i < MAX_CART_ITEMS; i++) {
      store.add({
        shortId: `b${String(i).padStart(7, '0')}`,
        priceMinorSeen: 1,
      })
    }
    expect(store.add(a)).toBe('cart_full')
    expect(store.getSnapshot()).toHaveLength(MAX_CART_ITEMS)
  })

  it('removes a book, ignores one that is not there, and clears', () => {
    const store = createCartStore(fakeStorage().storage)
    store.add(a)
    store.add(b)

    store.remove('zzzzzz99')
    expect(store.getSnapshot()).toHaveLength(2)
    store.remove('aaaaaa11')
    expect(store.getSnapshot()).toEqual([b])
    store.clear()
    expect(store.getSnapshot()).toEqual([])
  })

  it('remembers a newly accepted price', () => {
    const store = createCartStore(fakeStorage().storage)
    store.add(a)
    store.acceptPrice('aaaaaa11', 12000)
    expect(store.getSnapshot()).toEqual([{ ...a, priceMinorSeen: 12000 }])
    store.acceptPrice('zzzzzz99', 1) // not in the cart: nothing happens
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('survives a new page load: a second store reads what the first saved', () => {
    const { storage } = fakeStorage()
    createCartStore(storage).add(a)
    expect(createCartStore(storage).getSnapshot()).toEqual([a])
  })

  it('gives the same array until something changes, as React requires', () => {
    const store = createCartStore(fakeStorage().storage)
    store.add(a)
    const first = store.getSnapshot()
    expect(store.getSnapshot()).toBe(first)
    store.add(b)
    expect(store.getSnapshot()).not.toBe(first)
  })

  it('gives one shared empty array for an empty cart', () => {
    const one = createCartStore(fakeStorage().storage).getSnapshot()
    const two = createCartStore(fakeStorage().storage).getSnapshot()
    expect(one).toBe(two)
  })

  it('tells listeners about each change, and stops after they unsubscribe', () => {
    const store = createCartStore(fakeStorage().storage)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.add(a)
    store.remove('aaaaaa11')
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.add(b)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not notify when nothing changed', () => {
    const store = createCartStore(fakeStorage().storage)
    const listener = vi.fn()
    store.subscribe(listener)
    store.clear()
    store.remove('aaaaaa11')
    store.add(a)
    store.add(a)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('picks up a change made in another tab', () => {
    const { storage, data } = fakeStorage()
    let tabChanged = () => {}
    const stop = vi.fn()
    const store = createCartStore(storage, (onChange) => {
      tabChanged = onChange
      return stop
    })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    data[CART_STORAGE_KEY] = stored([b]) // the other tab wrote this
    tabChanged()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toEqual([b])

    unsubscribe()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('works for the session when storage is missing', () => {
    const store = createCartStore(null)
    store.add(a)
    expect(store.getSnapshot()).toEqual([a])
  })

  it('works for the session when storage throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createCartStore(broken)
    expect(store.getSnapshot()).toEqual([])
    store.add(a)
    store.add(b)
    store.remove('aaaaaa11')
    expect(store.getSnapshot()).toEqual([b])
  })

  it('falls back to memory when saving fails after reading worked', () => {
    const { storage } = fakeStorage()
    const store = createCartStore({
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('quota')
      },
    })
    store.add(a)
    expect(store.getSnapshot()).toEqual([a])
  })
})
