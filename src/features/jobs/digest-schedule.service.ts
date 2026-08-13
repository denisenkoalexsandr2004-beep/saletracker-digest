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

interface MoscowSlot {
  date: string;
  day: number;
  hour: number;
  weekday: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
}

interface ScheduledDigestDependencies {
  gateway: TelegramGateway;
  appUrl: string;
  subscriptions?: SubscriptionRepository;
  deliveries?: DigestDeliveryRepository;
  materials?: Material[];
  events?: CzsEvent[];
}

export function getMoscowSlot(value: string): MoscowSlot {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
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
    weekday: part("weekday") as MoscowSlot["weekday"],
  };
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

export async function runScheduledDigestDispatch(
  now: string,
  dependencies: ScheduledDigestDependencies,
): Promise<Record<string, unknown>> {
  const slot = getMoscowSlot(now);
  const subscriptions =
    dependencies.subscriptions ?? getSubscriptionRepository();
  const deliveries =
    dependencies.deliveries ?? getDigestDeliveryRepository();
  const records = await subscriptions.list();
  const due = records.filter(
    (subscription) =>
      subscription.telegram && isDigestDue(subscription.frequency, slot),
  );
  let sent = 0;
  let empty = 0;
  let alreadySent = 0;
  const failed: Array<{ subscriptionId: string; error: string }> = [];

  for (const subscription of due) {
    try {
      const delivery = await ensureDigestDelivery(
        subscription,
        {
          now,
          since: subscription.lastDigestAt ?? subscription.createdAt,
          issueKey: `digest:${subscription.id}:${slot.date}`,
          materials: dependencies.materials ?? [],
          events: dependencies.events ?? demoEvents,
        },
        deliveries,
      );

      if (!delivery.issue.items.length) {
        empty += 1;
        continue;
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

  return {
    slot: slot.date,
    due: due.length,
    sent,
    alreadySent,
    empty,
    failed,
  };
}
