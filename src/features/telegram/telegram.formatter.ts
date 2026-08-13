import type {
  DigestIssue,
  Material,
} from "@/features/digests/digest.types";

const TELEGRAM_TEXT_LIMIT = 4096;
const SEPARATOR = "\n\n\n";

export interface TelegramDeliveryMessage {
  html: string;
  itemIds: string[];
  includesCta: boolean;
}

export function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absoluteUrl(path: string, appUrl: string): string {
  return new URL(path, appUrl).toString();
}

function getBusinessImpact(material: Material): string {
  const legacyMoneyAngle = (
    material as Material & { moneyAngle?: string }
  ).moneyAngle;

  return material.businessImpact || legacyMoneyAngle || material.impact;
}

function getSourceUrl(material: Material, appUrl: string): string {
  return material.sourceUrls[0] ?? absoluteUrl(material.articlePath, appUrl);
}

function renderStory(
  material: Material,
  number: number,
  appUrl: string,
): string {
  const title = escapeTelegramHtml(material.title);
  const summary = escapeTelegramHtml(material.summary);
  const impact = escapeTelegramHtml(material.impact);
  const metrics = material.keyMetrics
    .slice(0, 2)
    .map(
      (metric) =>
        `<b>${escapeTelegramHtml(metric.value)}</b> — ${escapeTelegramHtml(metric.label)}\n${escapeTelegramHtml(metric.context)}`,
    )
    .join("\n\n");
  const businessImpact = escapeTelegramHtml(getBusinessImpact(material));
  const url = escapeTelegramHtml(getSourceUrl(material, appUrl));
  const sourceName = escapeTelegramHtml(
    material.sourceNames[0] ?? "первоисточник",
  );
  const metricsBlock = metrics
    ? `<b>📊 Ключевые цифры</b>\n<blockquote>${metrics}</blockquote>\n\n`
    : "";

  return `<b>${number}. ${title}</b>\n\n${summary}\n\n${metricsBlock}<b>Почему это важно:</b> ${businessImpact}\n\n${impact}\n\n<b>Подробнее:</b> <a href="${url}">Открыть статью · ${sourceName}</a>`;
}

function renderCta(issue: DigestIssue): string {
  const cta = escapeTelegramHtml(issue.cta);
  const url = escapeTelegramHtml(issue.ctaUrl);
  const eventSuffix = issue.event
    ? ` · ${escapeTelegramHtml(issue.event.name)}`
    : "";

  return `<b>Платформа «Центр Закупок Сетей»</b>\n\n${cta}\n\n<a href="${url}">Календарь ближайших мероприятий${eventSuffix}</a>`;
}

export function createTelegramDeliveryPlan(
  issue: DigestIssue,
  appUrl: string,
): TelegramDeliveryMessage[] {
  const storyBlocks = issue.items.map((item, index) => ({
    itemId: item.id,
    html: renderStory(item, index + 1, appUrl),
  }));
  const cta = renderCta(issue);
  const messages: TelegramDeliveryMessage[] = [];

  for (const block of storyBlocks) {
    const current = messages.at(-1);
    const candidate = current
      ? `${current.html}${SEPARATOR}${block.html}`
      : block.html;

    if (current && candidate.length <= TELEGRAM_TEXT_LIMIT) {
      current.html = candidate;
      current.itemIds.push(block.itemId);
      continue;
    }

    messages.push({
      html: block.html,
      itemIds: [block.itemId],
      includesCta: false,
    });
  }

  const last = messages.at(-1);

  if (!last) {
    return [{ html: cta, itemIds: [], includesCta: true }];
  }

  const withCta = `${last.html}${SEPARATOR}${cta}`;

  if (withCta.length <= TELEGRAM_TEXT_LIMIT) {
    last.html = withCta;
    last.includesCta = true;
  } else {
    messages.push({
      html: cta,
      itemIds: [],
      includesCta: true,
    });
  }

  return messages;
}
