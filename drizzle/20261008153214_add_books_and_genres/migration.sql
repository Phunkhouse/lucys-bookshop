CREATE TYPE "book_condition" AS ENUM('like_new', 'used');--> statement-breakpoint
CREATE TYPE "book_status" AS ENUM('available', 'reserved', 'sold', 'hidden');--> statement-breakpoint
CREATE TABLE "book_genres" (
	"book_id" uuid,
	"genre_id" uuid,
	CONSTRAINT "book_genres_pkey" PRIMARY KEY("book_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "book_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"book_id" uuid NOT NULL,
	"base_key" text NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "book_images_book_id_position_unique" UNIQUE("book_id","position"),
	CONSTRAINT "book_images_position_range" CHECK ("position" BETWEEN 0 AND 4),
	CONSTRAINT "book_images_size_positive" CHECK ("width" > 0 AND "height" > 0)
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"short_id" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"isbn" text,
	"description" text DEFAULT '' NOT NULL,
	"language" text NOT NULL,
	"condition" "book_condition" NOT NULL,
	"condition_note" text,
	"price_minor" integer NOT NULL,
	"currency" text DEFAULT 'CZK' NOT NULL,
	"status" "book_status" DEFAULT 'available'::"book_status" NOT NULL,
	"reserved_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone,
	CONSTRAINT "books_short_id_format" CHECK ("short_id" ~ '^[0-9a-z]{6,8}$'),
	CONSTRAINT "books_price_not_negative" CHECK ("price_minor" >= 0),
	CONSTRAINT "books_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "books_reserved_has_deadline" CHECK ("status" <> 'reserved' OR "reserved_until" IS NOT NULL),
	CONSTRAINT "books_sold_has_date" CHECK ("status" <> 'sold' OR "sold_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" text NOT NULL UNIQUE,
	"slug" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE INDEX "book_genres_genre_id_index" ON "book_genres" ("genre_id");--> statement-breakpoint
CREATE INDEX "books_status_index" ON "books" ("status");--> statement-breakpoint
CREATE INDEX "books_reserved_until_index" ON "books" ("reserved_until");--> statement-breakpoint
CREATE INDEX "books_sold_at_index" ON "books" ("sold_at");--> statement-breakpoint
CREATE INDEX "books_price_minor_index" ON "books" ("price_minor");--> statement-breakpoint
CREATE INDEX "books_isbn_index" ON "books" ("isbn");--> statement-breakpoint
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_genre_id_genres_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "book_images" ADD CONSTRAINT "book_images_book_id_books_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE;