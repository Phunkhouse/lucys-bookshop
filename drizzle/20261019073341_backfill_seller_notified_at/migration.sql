-- Orders placed before the seller notification existed count as notified, so
-- the retry job does not email the seller about old orders.
UPDATE "orders" SET "seller_notified_at" = "created_at" WHERE "seller_notified_at" IS NULL;
