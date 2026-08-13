import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { DigestIssue, MaterialMetric } from "@/features/digests/digest.types";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
};

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    connectionToken: text("connection_token").notNull(),
    name: text("name").notNull(),
    company: text("company").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    frequency: text("frequency").notNull(),
    targetSize: integer("target_size").notNull(),
    consent: boolean("consent").notNull(),
    consentedAt: timestamp("consented_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    lastDigestAt: timestamp("last_digest_at", {
      withTimezone: true,
      mode: "string",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscriptions_connection_token_uidx").on(
      table.connectionToken,
    ),
    index("subscriptions_frequency_created_idx").on(
      table.frequency,
      table.createdAt,
    ),
  ],
);

export const subscriptionTags = pgTable(
  "subscription_tags",
  {
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_tags_subscription_tag_uidx").on(
      table.subscriptionId,
      table.tag,
    ),
    index("subscription_tags_tag_idx").on(table.tag),
  ],
);

export const telegramAccounts = pgTable(
  "telegram_accounts",
  {
    subscriptionId: text("subscription_id")
      .primaryKey()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    username: text("username"),
    firstName: text("first_name").notNull(),
    connectedAt: timestamp("connected_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("telegram_accounts_chat_id_uidx").on(table.chatId)],
);

export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  processedAt: timestamp("processed_at", {
    withTimezone: true,
    mode: "string",
  })
    .notNull()
    .defaultNow(),
});

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: text("id").primaryKey(),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    model: text("model").notNull(),
    sourceCount: integer("source_count").notNull(),
    candidateCount: integer("candidate_count").notNull(),
    ...timestamps,
  },
  (table) => [index("ingestion_runs_started_idx").on(table.startedAt)],
);

export const newsCandidates = pgTable(
  "news_candidates",
  {
    id: text("id").primaryKey(),
    ingestionRunId: text("ingestion_run_id").references(
      () => ingestionRuns.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    collectedAt: timestamp("collected_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    summary: text("summary").notNull(),
    marketImpact: text("market_impact").notNull(),
    businessImpact: text("business_impact").notNull(),
    keyMetrics: jsonb("key_metrics").$type<MaterialMetric[]>().notNull(),
    tags: jsonb("tags").$type<string[]>().notNull(),
    confidence: real("confidence").notNull(),
    status: text("status").notNull(),
    verificationStatus: text("verification_status")
      .notNull()
      .default("unverified"),
    verificationReasons: jsonb("verification_reasons")
      .$type<string[]>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("news_candidates_source_url_uidx").on(table.sourceUrl),
    index("news_candidates_status_collected_idx").on(
      table.status,
      table.collectedAt,
    ),
  ],
);

export const materials = pgTable(
  "materials",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id").references(() => newsCandidates.id, {
      onDelete: "set null",
    }),
    storyId: text("story_id").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    impact: text("impact").notNull(),
    businessImpact: text("business_impact").notNull(),
    keyMetrics: jsonb("key_metrics").$type<MaterialMetric[]>().notNull(),
    articlePath: text("article_path").notNull(),
    sourceNames: jsonb("source_names").$type<string[]>().notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull(),
    sourcePublishedAt: timestamp("source_published_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    scope: text("scope").notNull(),
    status: text("status").notNull(),
    approvedAt: timestamp("approved_at", {
      withTimezone: true,
      mode: "string",
    }),
    importance: integer("importance").notNull().default(50),
    verificationLevel: text("verification_level")
      .notNull()
      .default("structural"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("materials_candidate_id_uidx").on(table.candidateId),
    uniqueIndex("materials_story_id_uidx").on(table.storyId),
    index("materials_status_approved_idx").on(table.status, table.approvedAt),
  ],
);

export const materialTags = pgTable(
  "material_tags",
  {
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("material_tags_material_tag_uidx").on(
      table.materialId,
      table.tag,
    ),
    index("material_tags_tag_idx").on(table.tag),
  ],
);

export const digestDeliveries = pgTable(
  "digest_deliveries",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    issueKey: text("issue_key").notNull(),
    issue: jsonb("issue").$type<DigestIssue>().notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("digest_deliveries_issue_key_uidx").on(table.issueKey),
    index("digest_deliveries_subscription_created_idx").on(
      table.subscriptionId,
      table.createdAt,
    ),
    index("digest_deliveries_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const deliveryMessages = pgTable(
  "delivery_messages",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => digestDeliveries.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    status: text("status").notNull().default("pending"),
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("delivery_messages_delivery_sequence_uidx").on(
      table.deliveryId,
      table.sequence,
    ),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: timestamp("started_at", {
      withTimezone: true,
      mode: "string",
    }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("job_runs_idempotency_key_uidx").on(table.idempotencyKey),
    index("job_runs_status_created_idx").on(table.status, table.createdAt),
  ],
);
