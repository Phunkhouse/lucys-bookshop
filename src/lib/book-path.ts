import { slugify } from './slug'

type BookRef = { shortId: string; title: string }

// Used when a title has no letters or digits at all, so the URL still has a slug.
const FALLBACK_SLUG = 'book'

// Canonical URL of a book: /books/<shortId>/<slug> (spec 6.2). The slug is
// cosmetic and computed from the current title, the short id is the key.
export function bookPath(book: BookRef): string {
  return `/books/${book.shortId}/${slugify(book.title) || FALLBACK_SLUG}`
}

// Where to send a visitor whose URL has the wrong slug (for example after the
// title was edited), or null if the URL is already canonical.
export function redirectTarget(book: BookRef, slug: string): string | null {
  const canonical = bookPath(book)
  return canonical === `/books/${book.shortId}/${slug}` ? null : canonical
}
