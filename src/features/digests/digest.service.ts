import type {
  CzsEvent,
  DigestIssue,
  DigestSelectionInput,
  Material,
} from "@/features/digests/digest.types";
import type { SubscriberRole } from "@/features/subscriptions/subscription.types";

function hasTag(material: Material, tags: Set<string>): boolean {
  return material.tags.some((tag) => tags.has(tag));
}

function compareMaterials(left: Material, right: Material): number {
  if (right.importance !== left.importance) {
    return right.importance - left.importance;
  }

  return (right.approvedAt ?? "").localeCompare(left.approvedAt ?? "");
}

function uniqueByStory(materials: Material[]): Material[] {
  const seen = new Set<string>();

  return materials.filter((material) => {
    if (seen.has(material.storyId)) {
      return false;
    }

    seen.add(material.storyId);
    return true;
  });
}

export function getEventCta(role: SubscriberRole): string {
  if (role === "supplier") {
    return "Хотите вывести свой продукт в розничные сети? Выберите подходящих закупщиков и назначьте переговоры на ближайшем мероприятии Платформы «Центр Закупок Сетей».";
  }

  if (role === "buyer") {
    return "Ищете новых поставщиков для своей сети? Приезжайте на ближайшее мероприятие Платформы «Центр Закупок Сетей» и проведите личные переговоры с производителями.";
  }

  return "Ищете новых партнёров для закупок и поставок? Узнайте о ближайших мероприятиях Платформы «Центр Закупок Сетей».";
}

function getEventUrl(event: CzsEvent | null, role: SubscriberRole): string {
  if (!event) {
    return "https://platforma-czs.ru/";
  }

  return role === "buyer" ? event.buyerUrl : event.supplierUrl;
}

export function findMatchingEvent(
  events: CzsEvent[],
  role: SubscriberRole,
  tags: string[],
  now: string,
): CzsEvent | null {
  const selectedTags = new Set(tags);

  return (
    events
      .filter(
        (event) =>
          event.status === "upcoming" &&
          event.startsAt >= now &&
          (event.roles.includes(role) || event.roles.includes("both")),
      )
      .map((event) => ({
        event,
        score: event.tags.reduce(
          (total, tag) => total + (selectedTags.has(tag) ? 1 : 0),
          0,
        ),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.event.startsAt.localeCompare(right.event.startsAt);
      })[0]?.event ?? null
  );
}

export function buildDigestIssue(input: DigestSelectionInput): DigestIssue {
  const selectedTags = new Set(input.tags);
  const approved = uniqueByStory(
    input.materials.filter(
      (material) =>
        material.status === "approved" &&
        Boolean(material.approvedAt) &&
        (material.approvedAt ?? "") > input.since,
    ),
  );

  const personalizedTarget = Math.round(input.targetSize * 0.8);
  const generalTarget = input.targetSize - personalizedTarget;

  const personalized = approved
    .filter(
      (material) =>
        material.scope === "tagged" && hasTag(material, selectedTags),
    )
    .sort(compareMaterials)
    .slice(0, personalizedTarget);

  const selectedIds = new Set(personalized.map((material) => material.id));
  const general = approved
    .filter(
      (material) =>
        !selectedIds.has(material.id) &&
        (material.scope === "general" || material.scope === "positive"),
    )
    .sort(compareMaterials)
    .slice(0, generalTarget);

  const items = [...personalized, ...general];
  const event = findMatchingEvent(
    input.events,
    input.role,
    input.tags,
    input.now,
  );

  return {
    id: `issue_${input.frequency}_${input.now.slice(0, 10)}`,
    generatedAt: input.now,
    frequency: input.frequency,
    targetSize: input.targetSize,
    items,
    personalizedCount: personalized.length,
    generalCount: general.length,
    event,
    cta: getEventCta(input.role),
    ctaUrl: getEventUrl(event, input.role),
  };
}
