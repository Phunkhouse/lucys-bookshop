import { describe, expect, it } from 'vitest'
import { FakeObjectStorage } from './fake-object-storage'
import { removeImages } from './remove-images'

const bytes = Uint8Array.from([1, 2, 3])

function withPhoto(storage: FakeObjectStorage, baseKey: string) {
  for (const name of ['thumb', 'medium', 'large']) {
    storage.put(`${baseKey}/${name}.jpg`, bytes, 'image/jpeg')
  }
}

describe('removeImages', () => {
  it('deletes all three sizes of every photo, and nothing else', async () => {
    const storage = new FakeObjectStorage()
    withPhoto(storage, 'books/b1/i1')
    withPhoto(storage, 'books/b1/i2')
    withPhoto(storage, 'books/b2/i3')

    await removeImages(storage, ['books/b1/i1', 'books/b1/i2'])

    expect(storage.keys()).toEqual([
      'books/b2/i3/large.jpg',
      'books/b2/i3/medium.jpg',
      'books/b2/i3/thumb.jpg',
    ])
  })

  it('does nothing for no photos', async () => {
    const storage = new FakeObjectStorage()
    withPhoto(storage, 'books/b1/i1')

    await removeImages(storage, [])

    expect(storage.keys()).toHaveLength(3)
  })

  // Files without a book are harmless, a failed delete must not undo the user's
  // action. The leftovers are reported, not thrown.
  it('does not throw when the storage fails, and says how many files were left', async () => {
    const storage = new FakeObjectStorage()
    withPhoto(storage, 'books/b1/i1')
    storage.failDeletes()

    const result = await removeImages(storage, ['books/b1/i1'])

    expect(result).toEqual({ failed: 3 })
    expect(storage.keys()).toHaveLength(3)
  })

  it('reports no failures when everything was deleted', async () => {
    const storage = new FakeObjectStorage()
    withPhoto(storage, 'books/b1/i1')

    expect(await removeImages(storage, ['books/b1/i1'])).toEqual({ failed: 0 })
  })
})
