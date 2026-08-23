import type { DigestFrequency } from "@/features/subscriptions/subscription.types";
import {
  dispatchDigestDelivery,
  ensureDigestDelivery,
} from "@/features/deliveries/digest-delivery.service";
import {
  getDigestDeliveryRepository,
  type DigestDeliveryRepository,
} from "@/features/deliveries/digest-delivery.repository";
import {
  getSubscriptionRepository,
  type SubscriptionRepository,
} from "@/features/subscriptions/subscription.repository";
import type { TelegramGateway } from "@/features/telegram/telegram.types";
import type { CzsEvent, Material } from "@/features/digests/digest.types";
import { demoEvents } from "@/shared/demo-data";

export interface MoscowSlot {
  date: string;
  day: number;
  hour: number;
  minute: number;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
}

const DELIVERY_LEASE_MS = 15 * 60_000;

export function isDigestDispatchWindow(slot: MoscowSlot): boolean {
  return slot.hour >= 12 && slot.hour < 15;
}

interface ScheduledDigestDependencies {
  gateway: TelegramGateway;
  appUrl: string;
  subscriptions?: SubscriptionRepository;
  deliveries?: DigestDeliveryRepository;
  materials?: Material[];
  events?: CzsEvent[];
  batchSize?: number;
}

export interface ScheduledDigestResult extends Record<string, unknown> {
  slot: string;
  cutoff: string;
  due: number;
  selected: number;
  remaining: number;
  inProgress: number;
  sent: number;
  alreadySent: number;
  empty: number;
  failed: Array<{ subscriptionId: string; error: string }>;
}

export class ScheduledDigestDispatchError extends Error {
  constructor(public readonly summary: ScheduledDigestResult) {
    super(`Не отправлено выпусков: ${summary.failed.length}.`);
    this.name = "ScheduledDigestDispatchError";
  }
}

export function getMoscowSlot(value: string): MoscowSlot {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    timeZone: "Europe/Moscow",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    weekday: part("weekday") as MoscowSlot["weekday"],
  };
}

export function getDigestDispatchRunKey(slot: MoscowSlot): string {
  const minuteBucket = Math.floor(slot.minute / 5) * 5;
  const hour = String(slot.hour).padStart(2, "0");
  const minute = String(minuteBucket).padStart(2, "0");
  return `digest-dispatch:${slot.date}:${hour}:${minute}`;
}

export function isDigestDue(
  frequency: DigestFrequency,
  slot: MoscowSlot,
): boolean {
  if (frequency === "daily") {
    return true;
  }

  if (frequency === "twice-weekly") {
    return slot.weekday === "Mon" || slot.weekday === "Thu";
  }

  if (frequency === "weekly") {
    return slot.weekday === "Mon";
  }

  return slot.weekday === "Mon" && slot.day <= 7;
}

export function getDigestCutoff(slot: MoscowSlot): string {
  return `${slot.date}T08:30:00.000Z`;
}

export async function runScheduledDigestDispatch(
  now: string,
  dependencies: ScheduledDigestDependencies,
): Promise<ScheduledDigestResult> {
  const slot = getMoscowSlot(now);
  const cutoff = getDigestCutoff(slot);
  const subscriptions =
    dependencies.subscriptions ?? getSubscriptionRepository();
  const deliveries =
    dependencies.deliveries ?? getDigestDeliveryRepository();
  const records = await subscriptions.list();
  const due = records.filter(
    (subscription) =>
      subscription.telegram && isDigestDue(subscription.frequency, slot),
  );
  const issueKeyFor = (subscriptionId: string) =>
    `digest:${subscriptionId}:${slot.date}`;
  const existing = await deliveries.findByIssueKeys(
    due.map((subscription) => issueKeyFor(subscription.id)),
  );
  const existingByIssueKey = new Map(
    existing.map((delivery) => [delivery.issueKey, delivery]),
  );
  const nowMs = Date.parse(now);
  const inProgressSubscriptions = new Set(
    due.flatMap((subscription) => {
      const delivery = existingByIssueKey.get(issueKeyFor(subscription.id));
      return delivery?.status === "sending" &&
        nowMs - Date.parse(delivery.updatedAt) < DELIVERY_LEASE_MS
        ? [subscription.id]
        : [];
    }),
  );
  const alreadySentAtStart = due.filter(
    (subscription) =>
      existingByIssueKey.get(issueKeyFor(subscription.id))?.status === "sent",
  ).length;
  const batchSize = Math.max(1, Math.min(dependencies.batchSize ?? 6, 20));
  const selected = due
    .filter((subscription) => {
      const delivery = existingByIssueKey.get(issueKeyFor(subscription.id));
      return (
        delivery?.status !== "sent" &&
        !inProgressSubscriptions.has(subscription.id)
      );
    })
    .sort((left, right) => {
      const priority = (subscriptionId: string) => {
        const delivery = existingByIssueKey.get(issueKeyFor(subscriptionId));

        if (delivery?.issue.items.length) {
          return 0;
        }

        return delivery ? 2 : 1;
      };

      return priority(left.id) - priority(right.id);
    })
    .slice(0, batchSize);
  const approvedMaterials = (dependencies.materials ?? []).filter(
    (material) => {
      const approvedAt = Date.parse(material.approvedAt ?? "");
      return Number.isFinite(approvedAt) && approvedAt <= Date.parse(cutoff);
    },
  );
  let sent = 0;
  let empty = 0;
  let alreadySent = alreadySentAtStart;
  const failed: Array<{ subscriptionId: string; error: string }> = [];

  for (const subscription of selected) {
    try {
      const delivery = await ensureDigestDelivery(
        subscription,
        {
          now,
          since: subscription.lastDigestAt ?? subscription.createdAt,
          issueKey: issueKeyFor(subscription.id),
          materials: approvedMaterials,
          events: dependencies.events ?? demoEvents,
        },
        deliveries,
      );

      if (!delivery.issue.items.length) {
        empty += 1;
        continue;
      }

      if (delivery.status === "waiting-telegram") {
        await deliveries.markReadyBySubscriptionId(subscription.id, now);
      }

      const result = await dispatchDigestDelivery(delivery.id, {
        gateway: dependencies.gateway,
        appUrl: dependencies.appUrl,
        now: () => new Date().toISOString(),
        subscriptions,
        deliveries,
      });

      if (result.alreadySent) {
        alreadySent += 1;
      } else {
        sent += 1;
      }
    } catch (error) {
      failed.push({
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : "UNKNOWN_DELIVERY_ERROR",
      });
    }
  }

  const summary: ScheduledDigestResult = {
    slot: slot.date,
    cutoff,
    due: due.length,
    selected: selected.length,
    remaining: Math.max(0, due.length - alreadySent - sent),
    inProgress: inProgressSubscriptions.size,
    sent,
    alreadySent,
    empty,
    failed,
  };

  if (failed.length) {
    throw new ScheduledDigestDispatchError(summary);
  }

  return summary;
}
