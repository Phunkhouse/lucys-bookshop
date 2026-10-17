import type { Rendition } from './photo-rules'

// The address of one size of a saved photo. `base` is IMAGE_BASE_URL: a public
// address (r2.dev now, a custom domain later) or a path on the app (/images).
export function imageUrl(base: string, baseKey: string, rendition: Rendition) {
  const root = base.replace(/\/+$/, '')
  const key = baseKey.replace(/^\/+|\/+$/g, '')
  return `${root}/${key}/${rendition}.jpg`
}
