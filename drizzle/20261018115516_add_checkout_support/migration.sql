CREATE TABLE "order_counters" (
	"year" integer PRIMARY KEY,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "order_counters_last_range" CHECK ("last" BETWEEN 0 AND 9999),
	CONSTRAINT "order_counters_year_range" CHECK ("year" BETWEEN 2000 AND 9999)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"zasilkovna_price_minor" integer,
	"pickup_instructions" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("id" = 1),
	CONSTRAINT "settings_price_not_negative" CHECK ("zasilkovna_price_minor" IS NULL OR "zasilkovna_price_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_key" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "terms_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_checkout_key_key" UNIQUE("checkout_key");