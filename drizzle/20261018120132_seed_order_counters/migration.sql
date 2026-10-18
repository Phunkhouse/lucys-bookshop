-- Start each year's counter at the highest sequence already used, so the first
-- checkout after this migration cannot collide with an existing order number
-- (YYYYNNNN: year * 10000 + sequence). Numbers outside that shape are ignored.
INSERT INTO "order_counters" ("year", "last")
SELECT "number" / 10000, MAX("number" % 10000)
FROM "orders"
WHERE "number" BETWEEN 20000000 AND 99999999
GROUP BY "number" / 10000
ON CONFLICT ("year") DO UPDATE SET "last" = GREATEST("order_counters"."last", EXCLUDED."last");
