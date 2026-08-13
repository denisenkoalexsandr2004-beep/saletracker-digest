import { createHash, randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";

import type {
  Material,
  MaterialStatus,
} from "@/features/digests/digest.types";
import type { NewsCandidate } from "@/features/news-ingestion/news-candidate.types";
import { getDatabase, type Database } from "@/shared/database/client";
import { materialTags, materials } from "@/shared/database/schema";
import { demoMaterials } from "@/shared/demo-data";

export interface MaterialRepository {
  list(limit?: number): Promise<Material[]>;
  listApproved(): Promise<Material[]>;
  createFromCandidate(candidate: NewsCandidate): Promise<Material>;
  updateStatus(id: string, status: MaterialStatus): Promise<Material | null>;
}

type MaterialRow = typeof materials.$inferSelect;

function mapMaterial(row: MaterialRow, tags: string[]): Material {
  return {
    id: row.id,
    storyId: row.storyId,
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    businessImpact: row.businessImpact,
    keyMetrics: row.keyMetrics,
    articlePath: row.articlePath,
    sourceNames: row.sourceNames,
    sourceUrls: row.sourceUrls,
    sourcePublishedAt: row.sourcePublishedAt,
    tags,
    scope: row.scope as Material["scope"],
    status: row.status as MaterialStatus,
    approvedAt: row.approvedAt ?? undefined,
    importance: row.importance,
  };
}

function storyIdForCandidate(candidate: NewsCandidate): string {
  const hash = createHash("sha256")
    .update(candidate.sourceUrl)
    .digest("hex")
    .slice(0, 20);
  return `story_${hash}`;
}

export class PostgresMaterialRepository implements MaterialRepository {
  constructor(private readonly db: Database) {}

  async list(limit = 100): Promise<Material[]> {
    const [rows, tags] = await Promise.all([
      this.db
        .select()
        .from(materials)
        .orderBy(desc(materials.createdAt))
        .limit(Math.max(1, Math.min(limit, 500))),
      this.db.select().from(materialTags),
    ]);
    const tagsByMaterial = new Map<string, string[]>();

    for (const item of tags) {
      const values = tagsByMaterial.get(item.materialId) ?? [];
      values.push(item.tag);
      tagsByMaterial.set(item.materialId, values);
    }

    return rows.map((row) =>
      mapMaterial(row, tagsByMaterial.get(row.id) ?? []),
    );
  }

  async listApproved(): Promise<Material[]> {
    return (await this.list(500)).filter(
      (material) => material.status === "approved",
    );
  }

  async createFromCandidate(candidate: NewsCandidate): Promise<Material> {
    const existing = await this.findByCandidateId(candidate.id);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const material: Material = {
      id: `material_${randomUUID()}`,
      storyId: storyIdForCandidate(candidate),
      title: candidate.title,
      summary: candidate.summary,
      impact: candidate.marketImpact,
      businessImpact: candidate.businessImpact,
      keyMetrics: candidate.keyMetrics,
      articlePath: `/blog/${candidate.id}`,
      sourceNames: [candidate.sourceName],
      sourceUrls: [candidate.sourceUrl],
      sourcePublishedAt: candidate.publishedAt,
      tags: candidate.tags,
      scope: "tagged",
      status: "review",
      importance: Math.round(candidate.confidence * 100),
    };

    await this.db.transaction(async (tx) => {
      await tx.insert(materials).values({
        id: material.id,
        candidateId: candidate.id,
        storyId: material.storyId,
        title: material.title,
        summary: material.summary,
        impact: material.impact,
        businessImpact: material.businessImpact,
        keyMetrics: material.keyMetrics,
        articlePath: material.articlePath,
        sourceNames: material.sourceNames,
        sourceUrls: material.sourceUrls,
        sourcePublishedAt: material.sourcePublishedAt,
        scope: material.scope,
        status: material.status,
        importance: material.importance,
        verificationLevel: candidate.verificationStatus,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(materialTags).values(
        material.tags.map((tag) => ({
          materialId: material.id,
          tag,
          createdAt: now,
        })),
      );
    });

    return material;
  }

  async updateStatus(
    id: string,
    status: MaterialStatus,
  ): Promise<Material | null> {
    const now = new Date().toISOString();
    const [row] = await this.db
      .update(materials)
      .set({
        status,
        approvedAt: status === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(materials.id, id))
      .returning();

    if (!row) {
      return null;
    }

    const tags = await this.db
      .select({ tag: materialTags.tag })
      .from(materialTags)
      .where(eq(materialTags.materialId, id));
    return mapMaterial(
      row,
      tags.map((item) => item.tag),
    );
  }

  private async findByCandidateId(candidateId: string): Promise<Material | null> {
    const [row] = await this.db
      .select()
      .from(materials)
      .where(eq(materials.candidateId, candidateId))
      .limit(1);

    if (!row) {
      return null;
    }

    const tags = await this.db
      .select({ tag: materialTags.tag })
      .from(materialTags)
      .where(eq(materialTags.materialId, row.id));
    return mapMaterial(
      row,
      tags.map((item) => item.tag),
    );
  }
}

export class InMemoryMaterialRepository implements MaterialRepository {
  private readonly records: Map<string, Material>;

  constructor(initial: Material[] = []) {
    this.records = new Map(initial.map((material) => [material.id, material]));
  }

  async list(limit = 100): Promise<Material[]> {
    return [...this.records.values()].slice(0, limit);
  }

  async listApproved(): Promise<Material[]> {
    return [...this.records.values()].filter(
      (material) => material.status === "approved",
    );
  }

  async createFromCandidate(candidate: NewsCandidate): Promise<Material> {
    const existing = [...this.records.values()].find(
      (material) => material.storyId === storyIdForCandidate(candidate),
    );

    if (existing) {
      return existing;
    }

    const material: Material = {
      id: `material_${randomUUID()}`,
      storyId: storyIdForCandidate(candidate),
      title: candidate.title,
      summary: candidate.summary,
      impact: candidate.marketImpact,
      businessImpact: candidate.businessImpact,
      keyMetrics: candidate.keyMetrics,
      articlePath: `/blog/${candidate.id}`,
      sourceNames: [candidate.sourceName],
      sourceUrls: [candidate.sourceUrl],
      sourcePublishedAt: candidate.publishedAt,
      tags: candidate.tags,
      scope: "tagged",
      status: "review",
      importance: Math.round(candidate.confidence * 100),
    };
    this.records.set(material.id, material);
    return material;
  }

  async updateStatus(
    id: string,
    status: MaterialStatus,
  ): Promise<Material | null> {
    const current = this.records.get(id);

    if (!current) {
      return null;
    }

    const updated = {
      ...current,
      status,
      approvedAt:
        status === "approved" ? new Date().toISOString() : undefined,
    };
    this.records.set(id, updated);
    return updated;
  }
}

declare global {
  var saleTrackerMaterialRepository: MaterialRepository | undefined;
}

export function getMaterialRepository(): MaterialRepository {
  if (!globalThis.saleTrackerMaterialRepository) {
    const db = getDatabase();
    globalThis.saleTrackerMaterialRepository = db
      ? new PostgresMaterialRepository(db)
      : new InMemoryMaterialRepository(demoMaterials);
  }

  return globalThis.saleTrackerMaterialRepository;
}
