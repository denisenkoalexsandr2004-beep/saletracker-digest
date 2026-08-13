CREATE TABLE "material_tags" (
	"material_id" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text,
	"story_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"impact" text NOT NULL,
	"business_impact" text NOT NULL,
	"key_metrics" jsonb NOT NULL,
	"article_path" text NOT NULL,
	"source_names" jsonb NOT NULL,
	"source_urls" jsonb NOT NULL,
	"source_published_at" timestamp with time zone NOT NULL,
	"scope" text NOT NULL,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone,
	"importance" integer DEFAULT 50 NOT NULL,
	"verification_level" text DEFAULT 'structural' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_tags" ADD CONSTRAINT "material_tags_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_candidate_id_news_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."news_candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "material_tags_material_tag_uidx" ON "material_tags" USING btree ("material_id","tag");--> statement-breakpoint
CREATE INDEX "material_tags_tag_idx" ON "material_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_candidate_id_uidx" ON "materials" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_story_id_uidx" ON "materials" USING btree ("story_id");--> statement-breakpoint
CREATE INDEX "materials_status_approved_idx" ON "materials" USING btree ("status","approved_at");