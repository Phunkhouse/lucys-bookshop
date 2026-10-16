import type { ObjectStorage } from './object-storage'

// In memory, for tests. It behaves like the real storage where that matters:
// an upload with another content type than was signed is refused (403), a
// range stops at the end of the object, copying a missing object fails.
export class FakeObjectStorage implements ObjectStorage {
  private objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >()
  private copiesLeft: number | null = null
  private deletesFail = false
  private readsFail = false
  private beforeCopy: (() => void) | null = null

  // Every URL handed out, so tests can check what was signed.
  presigned: { key: string; contentType: string; expiresInSeconds: number }[] =
    []

  keys(): string[] {
    return [...this.objects.keys()].sort()
  }

  // Test helper: put a file in place, as if it had been uploaded.
  put(key: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(key, { bytes, contentType })
  }

  // The first `count` copies work, every later one throws.
  failCopyAfter(count: number) {
    this.copiesLeft = count
  }

  failDeletes() {
    this.deletesFail = true
  }

  // Test helper: from now on every read (head and range) throws, as a transient
  // storage failure would.
  failReads() {
    this.readsFail = true
  }

  // Test helper: runs once, right before the next copy. Lets a test change a
  // file after it was checked and before it is copied.
  beforeNextCopy(callback: () => void) {
    this.beforeCopy = callback
  }

  async presignPut(input: {
    key: string
    contentType: string
    expiresInSeconds: number
  }) {
    this.presigned.push({ ...input })
    const query = new URLSearchParams({
      type: input.contentType,
      expires: String(input.expiresInSeconds),
    })
    return `https://fake-storage.test/${encodeURIComponent(input.key)}?${query}`
  }

  // What the browser does with a presigned URL.
  async uploadViaUrl(url: string, body: Uint8Array, contentType: string) {
    const parsed = new URL(url)
    if (contentType !== parsed.searchParams.get('type')) return { status: 403 }
    this.put(decodeURIComponent(parsed.pathname.slice(1)), body, contentType)
    return { status: 200 }
  }

  async head(key: string) {
    if (this.readsFail) throw new Error('Read failed (simulated)')
    const object = this.objects.get(key)
    return object
      ? { size: object.bytes.length, contentType: object.contentType }
      : null
  }

  async readRange(key: string, start: number, end: number) {
    if (this.readsFail) throw new Error('Read failed (simulated)')
    const object = this.objects.get(key)
    if (!object) throw new Error(`No such key: ${key}`)
    return object.bytes.slice(start, end + 1)
  }

  async copy(fromKey: string, toKey: string) {
    if (this.beforeCopy) {
      const callback = this.beforeCopy
      this.beforeCopy = null
      callback()
    }
    if (this.copiesLeft !== null) {
      if (this.copiesLeft === 0) throw new Error('Copy failed (simulated)')
      this.copiesLeft -= 1
    }
    const object = this.objects.get(fromKey)
    if (!object) throw new Error(`No such key: ${fromKey}`)
    this.objects.set(toKey, { ...object })
  }

  async deleteMany(keys: string[]) {
    if (this.deletesFail) throw new Error('Delete failed (simulated)')
    for (const key of keys) this.objects.delete(key)
  }
}
