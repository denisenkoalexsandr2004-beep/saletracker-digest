CREATE TABLE "news_ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"news_article_id" text,
	"provider_request_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micros" integer,
	"cost_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_ai_usage_events" ADD CONSTRAINT "news_ai_usage_events_news_article_id_news_articles_id_fk" FOREIGN KEY ("news_article_id") REFERENCES "public"."news_articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "news_ai_usage_provider_request_uidx" ON "news_ai_usage_events" USING btree ("provider","provider_request_id");--> statement-breakpoint
CREATE INDEX "news_ai_usage_created_idx" ON "news_ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "news_ai_usage_article_idx" ON "news_ai_usage_events" USING btree ("news_article_id");