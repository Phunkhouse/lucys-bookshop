import { slugify } from './slug'

// Canonical URL of a book: /books/<shortId>/<slug> (spec 6.2). The slug is
// cosmetic and computed from the current title, the short id is the key.
export function bookPath(book: { shortId: string; title: string }): string {
  return `/books/${book.shortId}/${slugify(book.title)}`
}
