import { describeStorageContract } from './storage-contract'
import { FakeObjectStorage } from './fake-object-storage'

// The fake must pass the same contract as the real storage.
describeStorageContract('FakeObjectStorage', () => {
  const storage = new FakeObjectStorage()
  return {
    storage,
    upload: (url, body, contentType) =>
      storage.uploadViaUrl(url, body, contentType),
  }
})
