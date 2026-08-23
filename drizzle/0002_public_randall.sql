CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"article_text" text,
	"content_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"rejection_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"discovered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_canonical_url_uidx" ON "news_articles" USING btree ("canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "news_articles_content_hash_uidx" ON "news_articles" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "news_articles_status_next_attempt_idx" ON "news_articles" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "news_articles_published_idx" ON "news_articles" USING btree ("published_at");