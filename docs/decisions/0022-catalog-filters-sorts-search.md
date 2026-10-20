# 0022. Catalog filters, sorts, search and pagination

Date: 2026-10-20
Status: accepted
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
- Filtered views get `noindex` or a canonical link to the unfiltered list (decided with SEO in M7), so crawlers do not index every combination.

## Alternatives considered

- Full-text search with `tsvector`: Czech has no built-in stemmer, so it adds machinery for little gain on a few hundred titles.
- An external search service (Meilisearch, Algolia): a new service and account, against the portability rule.
- Client-side filtering of the full list: breaks server rendering and grows with the catalog.
- Genre filter that requires all selected genres: empties the results too quickly in a small shop.
- Facet counts ("Fantasy (12)"): costly queries for little value at this size. Revisit if the catalog grows.

## Consequences

- One additive migration adds the two extensions and a trigram index (the migration-safety test still holds). Check that the Neon migration role may run `CREATE EXTENSION` before relying on it.
- `listCatalog` gains a query parameter and returns the page, the total and the page count. Genres and images are still fetched only for the rows on the page.
- The available-first rule exists in the sort too, so the availability parity test (ADR 0011) stays the single source of truth.
- Revisit the search choice if the catalog passes about 2 000 listings or if typo tolerance turns out to be poor.
