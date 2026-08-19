import type {
  CzsEvent,
  DigestIssue,
  DigestSelectionInput,
  Material,
} from "@/features/digests/digest.types";
import type {
  DigestFrequency,
  SubscriberRole,
} from "@/features/subscriptions/subscription.types";

const freshnessWindowDays: Record<DigestFrequency, number> = {
  daily: 2,
  "twice-weekly": 5,
  weekly: 10,
  monthly: 35,
};

const broadMarketTags = new Set([
  "Ритейл",
  "Федеральные сети",
  "Региональные сети",
  "E-commerce",
  "Маркетплейсы",
  "Логистика",
  "Импорт и экспорт",
  "Закупки и тендеры",
  "Цены и промо",
  "Потребительский спрос",
  "Качество и безопасность",
  "Маркировка товаров",
  "Регулирование",
  "Retail Tech",
  "Инвестиции и M&A",
]);

function hasTag(material: Material, tags: Set<string>): boolean {
  return material.tags.some((tag) => tags.has(tag));
}

function isGeneralMarketMaterial(material: Material): boolean {
  return (
    material.scope === "general" ||
    material.scope === "positive" ||
    material.tags.some((tag) => broadMarketTags.has(tag))
  );
}

function compareMaterials(left: Material, right: Material): number {
  const sourceDateDifference =
    Date.parse(right.sourcePublishedAt) - Date.parse(left.sourcePublishedAt);

  if (sourceDateDifference !== 0) {
    return sourceDateDifference;
  }

  if (right.importance !== left.importance) {
    return right.importance - left.importance;
  }

  return (
    Date.parse(right.approvedAt ?? "") - Date.parse(left.approvedAt ?? "")
  );
}

export function getSourceFreshnessStart(
  frequency: DigestFrequency,
  now: string,
): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - freshnessWindowDays[frequency]);
  return start.toISOString();
}

const welcomeWindowDays = 14;

/**
 * Первый выпуск после подключения Telegram собирается в расширенном окне:
 * подписчик приходит в произвольный момент, а редакция утверждает материалы
 * пачками. С обычным окном частоты такой выпуск почти всегда оказывался пустым.
 */
export function getWelcomeFreshnessStart(
  frequency: DigestFrequency,
  now: string,
): string {
  const start = new Date(now);
  start.setUTCDate(
    start.getUTCDate() -
      Math.max(freshnessWindowDays[frequency], welcomeWindowDays),
  );
  return start.toISOString();
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
  const approvedAfter = Date.parse(input.since);
  const sourceFreshAfter = Date.parse(
    input.sourceSince ?? getSourceFreshnessStart(input.frequency, input.now),
  );
  const latestSourceDate = Date.parse(input.now) + 5 * 60 * 1_000;
  const approved = uniqueByStory(
    input.materials.filter(
      (material) => {
        const approvedAt = Date.parse(material.approvedAt ?? "");
        const sourcePublishedAt = Date.parse(material.sourcePublishedAt);

        return (
          material.status === "approved" &&
          Number.isFinite(approvedAt) &&
          approvedAt > approvedAfter &&
          Number.isFinite(sourcePublishedAt) &&
          sourcePublishedAt >= sourceFreshAfter &&
          sourcePublishedAt <= latestSourceDate
        );
      },
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

  const personalizedIds = new Set(personalized.map((material) => material.id));
  const general = approved
    .filter(
      (material) =>
        !personalizedIds.has(material.id) &&
        isGeneralMarketMaterial(material),
    )
    .sort(compareMaterials)
    .slice(0, generalTarget);

  const selectedIds = new Set([
    ...personalized.map((material) => material.id),
    ...general.map((material) => material.id),
  ]);
  const remainingCapacity = input.targetSize - personalized.length - general.length;
  const additionalPersonalized =
    remainingCapacity > 0
      ? approved
          .filter(
            (material) =>
              !selectedIds.has(material.id) &&
              material.scope === "tagged" &&
              hasTag(material, selectedTags),
          )
          .sort(compareMaterials)
          .slice(0, remainingCapacity)
      : [];
  const items = [...personalized, ...additionalPersonalized, ...general];
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
    personalizedCount: personalized.length + additionalPersonalized.length,
    generalCount: general.length,
    event,
    cta: getEventCta(input.role),
    ctaUrl: getEventUrl(event, input.role),
  };
}
