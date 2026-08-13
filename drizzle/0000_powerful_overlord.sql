CREATE TABLE "delivery_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"telegram_message_id" bigint,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digest_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"issue_key" text NOT NULL,
	"issue" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"model" text NOT NULL,
	"source_count" integer NOT NULL,
	"candidate_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"ingestion_run_id" text,
	"title" text NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"market_impact" text NOT NULL,
	"business_impact" text NOT NULL,
	"key_metrics" jsonb NOT NULL,
	"tags" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"status" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"verification_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_tags" (
	"subscription_id" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_token" text NOT NULL,
	"name" text NOT NULL,
	"company" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"frequency" text NOT NULL,
	"target_size" integer NOT NULL,
	"consent" boolean NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"last_digest_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"chat_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"username" text,
	"first_name" text NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_messages" ADD CONSTRAINT "delivery_messages_delivery_id_digest_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."digest_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_deliveries" ADD CONSTRAINT "digest_deliveries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_candidates" ADD CONSTRAINT "news_candidates_ingestion_run_id_ingestion_runs_id_fk" FOREIGN KEY ("ingestion_run_id") REFERENCES "public"."ingestion_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_tags" ADD CONSTRAINT "subscription_tags_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_messages_delivery_sequence_uidx" ON "delivery_messages" USING btree ("delivery_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "digest_deliveries_issue_key_uidx" ON "digest_deliveries" USING btree ("issue_key");--> statement-breakpoint
CREATE INDEX "digest_deliveries_subscription_created_idx" ON "digest_deliveries" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "digest_deliveries_status_created_idx" ON "digest_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_idx" ON "ingestion_runs" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_idempotency_key_uidx" ON "job_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "job_runs_status_created_idx" ON "job_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_candidates_source_url_uidx" ON "news_candidates" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "news_candidates_status_collected_idx" ON "news_candidates" USING btree ("status","collected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_tags_subscription_tag_uidx" ON "subscription_tags" USING btree ("subscription_id","tag");--> statement-breakpoint
CREATE INDEX "subscription_tags_tag_idx" ON "subscription_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_connection_token_uidx" ON "subscriptions" USING btree ("connection_token");--> statement-breakpoint
CREATE INDEX "subscriptions_frequency_created_idx" ON "subscriptions" USING btree ("frequency","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_accounts_chat_id_uidx" ON "telegram_accounts" USING btree ("chat_id");