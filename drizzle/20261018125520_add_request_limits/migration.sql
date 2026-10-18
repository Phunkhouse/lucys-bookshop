CREATE TABLE "request_limits" (
	"key" text,
	"window_start" timestamp with time zone,
	"count" integer NOT NULL,
	CONSTRAINT "request_limits_pkey" PRIMARY KEY("key","window_start"),
	CONSTRAINT "request_limits_count_positive" CHECK ("count" >= 1)
);
--> statement-breakpoint
CREATE INDEX "request_limits_window_start_index" ON "request_limits" ("window_start");