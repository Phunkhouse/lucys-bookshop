-- Catalog search (ADR 0022): accent-insensitive, typo-tolerant matching.
-- Both extensions ship with Postgres and are allowed on Neon.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- unaccent() is only STABLE, so an index cannot use it directly. This wrapper
-- is declared IMMUTABLE (safe here: the dictionary never changes) and is the one
-- text the search index and the search query both use.
CREATE OR REPLACE FUNCTION catalog_search_text(title text, author text, isbn text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, title || ' ' || author || ' ' || coalesce(isbn, '')))
$$;
