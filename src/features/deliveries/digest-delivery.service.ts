import { randomUUID } from "node:crypto";

import {
  getDigestDeliveryRepository,
  type DigestDeliveryRepository,
} from "@/features/deliveries/digest-delivery.repository";
import type {
  DigestDeliveryRecord,
  DigestDeliveryView,
} from "@/features/deliveries/digest-delivery.types";
import {
  buildDigestIssue,
  getSourceFreshnessStart,
  getWelcomeFreshnessStart,
} from "@/features/digests/digest.service";
import type {
  CzsEvent,
  DigestIssue,
  Material,
} from "@/features/digests/digest.types";
import { getMaterialRepository } from "@/features/materials/material.repository";
import {
  getSubscriptionRepository,
  type SubscriptionRecord,
  type SubscriptionRepository,
} from "@/features/subscriptions/subscription.repository";
import {
  createTelegramDeliveryPlan,
  escapeTelegramHtml,
} from "@/features/telegram/telegram.formatter";
import type { TelegramGateway } from "@/features/telegram/telegram.types";
import { isDatabaseConfigured } from "@/shared/database/client";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

export class DigestDeliveryError extends Error {
  constructor(
    public readonly code:
      | "DELIVERY_NOT_FOUND"
      | "TELEGRAM_NOT_CONNECTED"
      | "DELIVERY_IN_PROGRESS"
      | "EMPTY_DIGEST",
    message: string,
  ) {
    super(message);
    this.name = "DigestDeliveryError";
  }
}

interface DeliveryPreparationOptions {
  now?: string;
  since?: string;
  sourceSince?: string;
  issueKey?: string;
  materials?: Material[];
  events?: CzsEvent[];
}

interface DispatchDependencies {
  gateway: TelegramGateway;
  appUrl: string;
  now: () => string;
  subscriptions?: SubscriptionRepository;
  deliveries?: DigestDeliveryRepository;
}

function buildIssueForSubscription(
  subscription: SubscriptionRecord,
  now: string,
  materials: Material[],
  events: CzsEvent[],
  since = getSourceFreshnessStart(subscription.frequency, now),
  sourceSince?: string,
): DigestIssue {
  return buildDigestIssue({
    role: subscription.role,
    tags: subscription.tags,
    targetSize: subscription.targetSize,
    frequency: subscription.frequency,
    since,
    sourceSince,
    materials,
    events,
    now,
  });
}

export async function ensureDigestDelivery(
  subscription: SubscriptionRecord,
  options: DeliveryPreparationOptions = {},
  repository: DigestDeliveryRepository = getDigestDeliveryRepository(),
): Promise<DigestDeliveryRecord> {
  const issueKey = options.issueKey ?? `${subscription.id}:first`;
  const existing = await repository.findByIssueKey(issueKey);
  // Пустой выпуск пересобирается, пока он не ушёл в отправку: подписчик мог
  // подключить Telegram раньше, чем редакция утвердила первые материалы.
  const canRebuild =
    existing !== null &&
    existing.issue.items.length === 0 &&
    existing.status !== "sending" &&
    existing.status !== "sent";

  if (existing && !canRebuild) {
    return existing;
  }

  const now = options.now ?? new Date().toISOString();
  // Плановая рассылка всегда передаёт `since` явно. Его отсутствие означает
  // первый выпуск подписчика — он собирается в расширенном окне свежести.
  const isWelcomeIssue = !options.since;
  const welcomeStart = getWelcomeFreshnessStart(subscription.frequency, now);
  const since = options.since ?? welcomeStart;
  const sourceSince =
    options.sourceSince ?? (isWelcomeIssue ? welcomeStart : undefined);
  const issue = buildIssueForSubscription(
    subscription,
    now,
    options.materials ?? (isDatabaseConfigured() ? [] : demoMaterials),
    options.events ?? demoEvents,
    since,
    sourceSince,
  );

  if (existing) {
    return (await repository.replaceIssue(existing.id, issue, now)) ?? existing;
  }

  return repository.create({
    id: `delivery_${randomUUID()}`,
    subscriptionId: subscription.id,
    issueKey,
    issue,
    status: subscription.telegram ? "ready" : "waiting-telegram",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function prepareDigestDelivery(
  subscriptionId: string,
  options: DeliveryPreparationOptions = {},
  subscriptions: SubscriptionRepository = getSubscriptionRepository(),
  deliveries: DigestDeliveryRepository = getDigestDeliveryRepository(),
): Promise<DigestDeliveryRecord | null> {
  const subscription = await subscriptions.findById(subscriptionId);
  const preparedOptions = options.materials
    ? options
    : {
        ...options,
        materials: await getMaterialRepository().listApproved(),
      };
  return subscription
    ? await ensureDigestDelivery(subscription, preparedOptions, deliveries)
    : null;
}

export async function synchronizeDigestDeliveries(
  options: DeliveryPreparationOptions = {},
  subscriptions: SubscriptionRepository = getSubscriptionRepository(),
  deliveries: DigestDeliveryRepository = getDigestDeliveryRepository(),
): Promise<DigestDeliveryRecord[]> {
  const records = await subscriptions.list();
  const preparedOptions = options.materials
    ? options
    : {
        ...options,
        materials: await getMaterialRepository().listApproved(),
      };
  return Promise.all(
    records.map((subscription) =>
      ensureDigestDelivery(subscription, preparedOptions, deliveries),
    ),
  );
}

export async function markDigestDeliveryReady(
  subscription: SubscriptionRecord,
  now: string,
  options: DeliveryPreparationOptions = {},
  deliveries: DigestDeliveryRepository = getDigestDeliveryRepository(),
): Promise<DigestDeliveryRecord> {
  const materials =
    options.materials ?? (await getMaterialRepository().listApproved());
  const connectedAt = subscription.telegram?.connectedAt ?? now;
  const delivery = await ensureDigestDelivery(
    subscription,
    {
      ...options,
      materials,
      now,
      issueKey: options.issueKey ?? `${subscription.id}:connected:${connectedAt}`,
    },
    deliveries,
  );

  return (
    (await deliveries.markReadyBySubscriptionId(subscription.id, now)) ?? delivery
  );
}

function formatIssueDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function getGreeting(value: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
      timeZone: "Europe/Moscow",
    }).format(new Date(value)),
  );

  if (hour < 12) {
    return "Доброе утро";
  }

  if (hour < 18) {
    return "Добрый день";
  }

  return "Добрый вечер";
}

export function createDigestGreeting(
  issue: DigestIssue,
  subscriberName: string,
): string {
  const firstName = subscriberName.trim().split(/\s+/)[0] || "коллега";
  const itemWord =
    issue.items.length % 10 === 1 && issue.items.length % 100 !== 11
      ? "новость"
      : issue.items.length % 10 >= 2 &&
          issue.items.length % 10 <= 4 &&
          (issue.items.length % 100 < 12 || issue.items.length % 100 > 14)
        ? "новости"
        : "новостей";

  return [
    `<b>${getGreeting(issue.generatedAt)}, ${escapeTelegramHtml(firstName)}!</b>`,
    "",
    `Редакция Платформы Сейл Трекер подготовила для вас персональный дайджест на <b>${formatIssueDate(issue.generatedAt)}</b>.`,
    "",
    `В выпуске — ${issue.items.length} ${itemWord}: ${issue.personalizedCount} по выбранным интересам и ${issue.generalCount} общерыночных.`,
  ].join("\n");
}

export function toDigestDeliveryView(
  delivery: DigestDeliveryRecord,
  subscription: SubscriptionRecord,
): DigestDeliveryView {
  return {
    id: delivery.id,
    status: delivery.status,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    sentAt: delivery.sentAt,
    error: delivery.error,
    subscriber: {
      name: subscription.name,
      company: subscription.company,
      role: subscription.role,
      tags: subscription.tags,
      frequency: subscription.frequency,
      targetSize: subscription.targetSize,
      telegramConnected: Boolean(subscription.telegram),
      telegramUsername: subscription.telegram?.username,
    },
    issue: {
      id: delivery.issue.id,
      itemCount: delivery.issue.items.length,
      personalizedCount: delivery.issue.personalizedCount,
      generalCount: delivery.issue.generalCount,
      eventName: delivery.issue.event?.name,
      items: delivery.issue.items.map((item) => ({
        id: item.id,
        title: item.title,
        articlePath: item.articlePath,
        sourceUrls: item.sourceUrls,
        metrics: item.keyMetrics.map(
          (metric) => `${metric.value} — ${metric.label}`,
        ),
      })),
    },
  };
}

export async function listDigestDeliveryViews(
  limit = 20,
  subscriptions: SubscriptionRepository = getSubscriptionRepository(),
  deliveries: DigestDeliveryRepository = getDigestDeliveryRepository(),
): Promise<DigestDeliveryView[]> {
  const records = await deliveries.list(limit);
  const views = await Promise.all(
    records.map(async (delivery) => {
      const subscription = await subscriptions.findById(
        delivery.subscriptionId,
      );
      return subscription ? toDigestDeliveryView(delivery, subscription) : null;
    }),
  );
  return views.filter((view): view is DigestDeliveryView => Boolean(view));
}

export async function dispatchDigestDelivery(
  deliveryId: string,
  dependencies: DispatchDependencies,
): Promise<{ delivery: DigestDeliveryRecord; alreadySent: boolean }> {
  const deliveries =
    dependencies.deliveries ?? getDigestDeliveryRepository();
  const subscriptions =
    dependencies.subscriptions ?? getSubscriptionRepository();
  const claimed = await deliveries.claimForSending(
    deliveryId,
    dependencies.now(),
  );

  if (claimed.status === "not-found") {
    throw new DigestDeliveryError(
      "DELIVERY_NOT_FOUND",
      "Персональный выпуск не найден.",
    );
  }

  if (claimed.status === "not-ready") {
    throw new DigestDeliveryError(
      "TELEGRAM_NOT_CONNECTED",
      "Пользователь ещё не подключил Telegram.",
    );
  }

  if (claimed.status === "already-sending") {
    throw new DigestDeliveryError(
      "DELIVERY_IN_PROGRESS",
      "Отправка выпуска уже выполняется.",
    );
  }

  if (claimed.status === "already-sent") {
    return { delivery: claimed.delivery, alreadySent: true };
  }

  const subscription = await subscriptions.findById(
    claimed.delivery.subscriptionId,
  );
  const chatId = subscription?.telegram?.chatId;

  if (!subscription || !chatId) {
    await deliveries.markFailed(
      deliveryId,
      "Telegram не подключён.",
      dependencies.now(),
    );
    throw new DigestDeliveryError(
      "TELEGRAM_NOT_CONNECTED",
      "Пользователь ещё не подключил Telegram.",
    );
  }

  if (claimed.delivery.issue.items.length === 0) {
    await deliveries.markFailed(
      deliveryId,
      "Нет утверждённых материалов.",
      dependencies.now(),
    );
    throw new DigestDeliveryError(
      "EMPTY_DIGEST",
      "В выпуске нет утверждённых материалов.",
    );
  }

  try {
    const messages = createTelegramDeliveryPlan(
      claimed.delivery.issue,
      dependencies.appUrl,
    );
    const outbound = [
      createDigestGreeting(claimed.delivery.issue, subscription.name),
      ...messages.map((message) => message.html),
    ];
    const checkpoints = await deliveries.ensureMessageCheckpoints(
      deliveryId,
      outbound.length,
      dependencies.now(),
    );
    const sentSequences = new Set(
      checkpoints
        .filter((checkpoint) => checkpoint.status === "sent")
        .map((checkpoint) => checkpoint.sequence),
    );

    for (const [sequence, html] of outbound.entries()) {
      if (sentSequences.has(sequence)) {
        continue;
      }

      try {
        await dependencies.gateway.sendMessage(chatId, html, {
          parseMode: "HTML",
          disableLinkPreview: true,
        });
        await deliveries.markMessageSent(
          deliveryId,
          sequence,
          dependencies.now(),
        );
      } catch (error) {
        await deliveries.markMessageFailed(
          deliveryId,
          sequence,
          error instanceof Error ? error.message : "Ошибка Telegram API.",
          dependencies.now(),
        );
        throw error;
      }
    }

    const sentAt = dependencies.now();
    const sent = await deliveries.markSent(deliveryId, sentAt);
    await subscriptions.markDigestSent(subscription.id, sentAt);

    return {
      delivery: sent ?? claimed.delivery,
      alreadySent: false,
    };
  } catch (error) {
    await deliveries.markFailed(
      deliveryId,
      error instanceof Error ? error.message : "Ошибка Telegram API.",
      dependencies.now(),
    );
    throw error;
  }
}
