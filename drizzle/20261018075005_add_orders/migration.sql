CREATE TYPE "order_status" AS ENUM('pending_payment', 'paid', 'shipped', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "payment_method" AS ENUM('bank_transfer', 'cash_on_pickup');--> statement-breakpoint
CREATE TYPE "shipping_method" AS ENUM('pickup', 'zasilkovna');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"title_snapshot" text NOT NULL,
	"price_minor_snapshot" integer NOT NULL,
	CONSTRAINT "order_items_order_id_book_id_unique" UNIQUE("order_id","book_id"),
	CONSTRAINT "order_items_price_not_negative" CHECK ("price_minor_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"number" integer NOT NULL UNIQUE,
	"public_token" text NOT NULL UNIQUE,
	"status" "order_status" DEFAULT 'pending_payment'::"order_status" NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"shipping_method" "shipping_method" NOT NULL,
	"shipping_details" text,
	"shipping_cost_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"locale" text DEFAULT 'cs' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"seller_reminded_at" timestamp with time zone,
	"tracking_number" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "orders_number_format" CHECK ("number" BETWEEN 1 AND 2147483647),
	CONSTRAINT "orders_amounts_not_negative" CHECK ("shipping_cost_minor" >= 0 AND "total_minor" >= 0),
	CONSTRAINT "orders_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_paid_has_date" CHECK ("status" NOT IN ('paid', 'shipped', 'completed') OR "paid_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "reserved_by_order_id" uuid;--> statement-breakpoint
CREATE INDEX "books_reserved_by_order_id_index" ON "books" ("reserved_by_order_id");--> statement-breakpoint
CREATE INDEX "order_items_book_id_index" ON "order_items" ("book_id");--> statement-breakpoint
CREATE INDEX "orders_status_index" ON "orders" ("status");--> statement-breakpoint
CREATE INDEX "orders_expires_at_index" ON "orders" ("expires_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_index" ON "orders" ("created_at");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_reserved_by_order_id_orders_id_fkey" FOREIGN KEY ("reserved_by_order_id") REFERENCES "orders"("id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id");