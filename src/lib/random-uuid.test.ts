import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { randomUuid } from './random-uuid'

const V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

// A browser outside a secure context (plain http on a home network) or an older
// one (Safari before 15.4) has crypto.getRandomValues but not crypto.randomUUID.
const withoutRandomUuid = (fill?: (bytes: Uint8Array) => void) => ({
  getRandomValues: vi.fn(<T extends ArrayBufferView>(array: T) => {
    if (fill) fill(array as unknown as Uint8Array)
    else webcrypto.getRandomValues(array as unknown as Uint8Array)
    return array
  }),
})

describe('randomUuid: where the browser has randomUUID', () => {
  it('uses it', () => {
    const randomUUID = vi.fn(() => '11111111-2222-4333-8444-555555555555')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() })

    expect(randomUuid()).toBe('11111111-2222-4333-8444-555555555555')
    expect(randomUUID).toHaveBeenCalledTimes(1)
  })

  it('calls it on the crypto object, as the browser insists', () => {
    const fake = {
      seen: null as unknown,
      randomUUID(this: unknown) {
        fake.seen = this
        return '11111111-2222-4333-8444-555555555555'
      },
    }
    vi.stubGlobal('crypto', fake)

    randomUuid()

    expect(fake.seen).toBe(fake)
  })
})

describe('randomUuid: where the browser has only getRandomValues', () => {
  it('makes a version 4 UUID that the server accepts', () => {
    vi.stubGlobal('crypto', withoutRandomUuid())

    const id = randomUuid()

    expect(id).toMatch(V4)
    expect(z.uuid().safeParse(id).success).toBe(true)
  })

  // The two bit patterns that must never come from the random bytes.
  it('forces the version and variant bits whatever the random bytes are', () => {
    vi.stubGlobal(
      'crypto',
      withoutRandomUuid((bytes) => bytes.fill(0x00)),
    )
    expect(randomUuid()).toBe('00000000-0000-4000-8000-000000000000')

    vi.stubGlobal(
      'crypto',
      withoutRandomUuid((bytes) => bytes.fill(0xff)),
    )
    expect(randomUuid()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  })

  it('asks for 16 random bytes and never uses Math.random', () => {
    const fake = withoutRandomUuid()
    vi.stubGlobal('crypto', fake)
    const guess = vi.spyOn(Math, 'random')

    randomUuid()

    expect(fake.getRandomValues).toHaveBeenCalledTimes(1)
    const [array] = fake.getRandomValues.mock.calls[0] as unknown as [
      Uint8Array,
    ]
    expect(array).toBeInstanceOf(Uint8Array)
    expect(array.length).toBe(16)
    expect(guess).not.toHaveBeenCalled()
    guess.mockRestore()
  })

  it('does not repeat itself', () => {
    vi.stubGlobal('crypto', withoutRandomUuid())

    const ids = new Set(Array.from({ length: 2000 }, () => randomUuid()))

    expect(ids.size).toBe(2000)
  })

  it('uses every random bit it is given apart from the six it must set', () => {
    // 0x5a bytes: the version nibble and the variant bits are replaced, the rest kept.
    vi.stubGlobal(
      'crypto',
      withoutRandomUuid((bytes) => bytes.fill(0x5a)),
    )

    expect(randomUuid()).toBe('5a5a5a5a-5a5a-4a5a-9a5a-5a5a5a5a5a5a')
  })
})

// An identifier that could be guessed is worse than no identifier, so with no
// secure source at all it fails loudly instead of falling back to Math.random.
describe('randomUuid: where there is no secure random source', () => {
  it('fails with a clear message when crypto is missing', () => {
    vi.stubGlobal('crypto', undefined)

    expect(() => randomUuid()).toThrow(/random/i)
  })

  it('fails with a clear message when crypto has no getRandomValues', () => {
    vi.stubGlobal('crypto', {})

    expect(() => randomUuid()).toThrow(/random/i)
  })
})
