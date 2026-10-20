-- The catalog sorts titles and authors in Czech order (ADR 0022), which needs
-- the ICU collation below. This changes nothing: it fails the migration, and so
-- the production build, if the database lacks the collation, instead of letting
-- the live catalog fail on its first sorted request.
DO $$
BEGIN
  PERFORM 'a' < 'b' COLLATE "cs-CZ-x-icu";
END
$$;
