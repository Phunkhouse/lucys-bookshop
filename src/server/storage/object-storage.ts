// The storage the shop keeps photos in, behind an interface like the other
// integrations: Cloudflare R2 in production, MinIO locally and in CI, and an
// in-memory fake in unit tests. Every implementation must pass the same
// contract (storage-contract.ts).
export interface ObjectStorage {
  // A URL the browser can PUT one file to, for a limited time. The key and the
  // content type are part of the signature, so they cannot be changed.
  presignPut(input: {
    key: string
    contentType: string
    expiresInSeconds: number
  }): Promise<string>

  // Size and type of an object, or null when it is not there.
  head(
    key: string,
  ): Promise<{ size: number; contentType: string | null } | null>

  // Bytes start..end, both included. Stops at the end of the object.
  readRange(key: string, start: number, end: number): Promise<Uint8Array>

  // Copies within the bucket. Fails when the source does not exist.
  copy(fromKey: string, toKey: string): Promise<void>

  // Missing keys are not an error.
  deleteMany(keys: string[]): Promise<void>
}
