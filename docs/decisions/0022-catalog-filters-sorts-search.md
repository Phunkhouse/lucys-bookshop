# 0022. Catalog filters, sorts, search and pagination

Date: 2026-10-20
Status: accepted (built, M6)
Milestone: M6

## Context

The catalog lists every visible book on one page. Spec 6.1 asks for filters, sorts, text search and pagination, with state in the URL so views can be shared and the back button works. The shop has 50-300 listings, one developer, no budget for extra services, and must stay portable (Postgres only).

## Decision

- **The URL is the only state.** The catalog page parses `searchParams` with one Zod schema (`src/server/catalog-query.ts`) and passes a typed query to `listCatalog`. Parsing is lenient: an unknown or malformed value falls back to its default, so a hand-edited URL never gives an error. The filter UI is a plain GET form, so it works without JavaScript.
- **Search is `unaccent` plus `pg_trgm` in Postgres.** Title, author and ISBN are matched case- and accent-insensitively ("kral" finds "Král"). Every word of the query must match. A query of 10 or 13 digits (hyphens ignored) is an exact ISBN match. Both extensions are available on Neon and in the local `postgres:18` image.
- **Filters:** genre (several genres match any of them), condition, language, price range in whole CZK (converted to minor units on the server), and "only available" (reuses `isAvailableSql`, ADR 0011). Publication year and format are left out: the schema has neither column.
- **Sorts:** newest (default), price low-high, price high-low, title A-Z, author A-Z. **Available books always come first**, in every sort, then the chosen key, then the short id as the last tie-break so pages are stable. Czech order needs a Czech collation, checked in a database test.
- **Pagination:** numbered pages (`?page=2`), 24 per page, an out-of-range page is clamped to the last one. No "load more": it needs client state and breaks shareable URLs.
- **Genre and language options come from the data**, not from a fixed list in the parser. The parser only checks the shape of a genre key, and an unknown key matches nothing.
- **Clean URLs:** the form sends empty and default values (`q=&sort=newest`), so the page redirects (307) to the short form of the same view (`canonicalCatalogPath`, unit tested, and it never redirects twice). Unknown keys are dropped by the same redirect.
- **Indexing:** a view with a search, filters or a non-default sort is `noindex, follow`. The plain catalog and page numbers alone stay indexable. A canonical link is left to the SEO work in M7.
- **Czech order** uses `COLLATE "cs-CZ-x-icu"` (the database's own collation is `en_US`). A migration with no effect fails the build if the database lacks it, so the live catalog cannot fail on its first sorted request.

## Alternatives considered

- Full-text search with `tsvector`: Czech has no built-in stemmer, so it adds machinery for little gain on a few hundred titles.
- An external search service (Meilisearch, Algolia): a new service and account, against the portability rule.
- Client-side filtering of the full list: breaks server rendering and grows with the catalog.
- Genre filter that requires all selected genres: empties the results too quickly in a small shop.
- Facet counts ("Fantasy (12)"): costly queries for little value at this size. Revisit if the catalog grows.

## Consequences

- Two additive migrations add the extensions, `catalog_search_text()` and the trigram index, and a third checks the collation (the migration-safety test still holds). Changing `catalog_search_text()` does not reindex: write a migration that replaces the function and recreates the index. `CREATE EXTENSION` on Neon ran for the first time in the production build, so watch that build.
- The exact ISBN match relies on ISBNs being stored as digits without hyphens, which the admin form does on save (`normalizeIsbn`).
- `listCatalog` gains a query parameter and returns the page, the total and the page count. Genres and images are still fetched only for the rows on the page.
- The available-first rule exists in the sort too, so the availability parity test (ADR 0011) stays the single source of truth.
- Revisit the search choice if the catalog passes about 2 000 listings or if typo tolerance turns out to be poor.
