import type { DigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import {
  dispatchDigestDelivery,
  markDigestDeliveryReady,
} from "@/features/deliveries/digest-delivery.service";
import type {
  CzsEvent,
  Material,
} from "@/features/digests/digest.types";
import {
  frequencyLabels,
  roleLabels,
} from "@/features/subscriptions/subscription.types";
import type {
  SubscriptionRecord,
  SubscriptionRepository,
} from "@/features/subscriptions/subscription.repository";
import {
  escapeTelegramHtml,
} from "@/features/telegram/telegram.formatter";
import type {
  TelegramGateway,
  TelegramUpdate,
} from "@/features/telegram/telegram.types";
import type { TelegramUpdateRepository } from "@/features/telegram/telegram-update.repository";

export interface TelegramUpdateDependencies {
  gateway: TelegramGateway;
  subscriptions: SubscriptionRepository;
  deliveries: DigestDeliveryRepository;
  updates: TelegramUpdateRepository;
  materials: Material[];
  events: CzsEvent[];
  appUrl: string;
  now: () => string;
}

interface ParsedCommand {
  command: "start" | "digest" | "settings" | "help" | "unknown";
  argument?: string;
}

function parseCommand(text: string): ParsedCommand {
  const [rawCommand, argument] = text.trim().split(/\s+/, 2);
  const command = rawCommand.toLowerCase().split("@")[0];

  if (
    command === "/start" ||
    command === "/digest" ||
    command === "/settings" ||
    command === "/help"
  ) {
    return {
      command: command.slice(1) as ParsedCommand["command"],
      argument,
    };
  }

  return { command: "unknown" };
}

function settingsMessage(subscription: SubscriptionRecord): string {
  return [
    "<b>Ваши настройки дайджеста</b>",
    "",
    `Роль: ${escapeTelegramHtml(roleLabels[subscription.role])}`,
    `Периодичность: ${escapeTelegramHtml(frequencyLabels[subscription.frequency])}`,
    `Объём: до ${subscription.targetSize} новостей`,
    `Интересы: ${escapeTelegramHtml(subscription.tags.join(", "))}`,
    "",
    "Изменить настройки можно по персональной ссылке на сайте SaleTracker.",
  ].join("\n");
}

async function handleStart(
  update: TelegramUpdate,
  argument: string | undefined,
  dependencies: TelegramUpdateDependencies,
): Promise<void> {
  const message = update.message;

  if (!message?.from) {
    return;
  }

  if (message.chat.type !== "private") {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Подключение доступно только в личном чате с ботом.",
    );
    return;
  }

  if (!argument) {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Здравствуйте! Настройте дайджест на сайте SaleTracker и откройте персональную ссылку подключения.",
    );
    return;
  }

  const result = await dependencies.subscriptions.connectTelegram(
    argument,
    {
      chatId: message.chat.id,
      userId: message.from.id,
      username: message.from.username,
      firstName: message.from.first_name,
    },
    dependencies.now(),
  );

  if (result.status === "not-found") {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Ссылка подключения недействительна или устарела. Создайте новую подписку на сайте SaleTracker.",
    );
    return;
  }

  if (result.status === "conflict") {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Эта ссылка уже привязана к другому Telegram-аккаунту.",
    );
    return;
  }

  const delivery = await markDigestDeliveryReady(
    result.subscription,
    dependencies.now(),
    {
      materials: dependencies.materials,
      events: dependencies.events,
    },
    dependencies.deliveries,
  );

  if (result.status === "connected") {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      [
        "<b>Добро пожаловать в «Дайджест Платформы Сейл Трекер»!</b>",
        "",
        "Telegram подключён. Ниже отправляем ваш первый персональный выпуск.",
        "",
        `Компания: ${escapeTelegramHtml(result.subscription.company)}`,
        `Интересы: ${escapeTelegramHtml(result.subscription.tags.join(", "))}`,
      ].join("\n"),
      { parseMode: "HTML" },
    );
  }

  if (!delivery.issue.items.length) {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Подписка активна. Первый выпуск появится здесь, как только система соберёт проверенные материалы по вашим интересам.",
    );
    return;
  }

  const dispatched = await dispatchDigestDelivery(delivery.id, {
    gateway: dependencies.gateway,
    appUrl: dependencies.appUrl,
    now: dependencies.now,
    subscriptions: dependencies.subscriptions,
    deliveries: dependencies.deliveries,
  });

  if (result.status === "already-connected" && dispatched.alreadySent) {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      "Telegram уже подключён. Последний персональный выпуск уже был отправлен в этот чат.",
    );
  }
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  dependencies: TelegramUpdateDependencies,
): Promise<"processed" | "duplicate" | "ignored"> {
  if (await dependencies.updates.has(update.update_id)) {
    return "duplicate";
  }

  const message = update.message;

  if (!message?.text) {
    await dependencies.updates.markProcessed(update.update_id);
    return "ignored";
  }

  const parsed = parseCommand(message.text);

  if (parsed.command === "start") {
    await handleStart(update, parsed.argument, dependencies);
  } else if (parsed.command === "help" || parsed.command === "unknown") {
    await dependencies.gateway.sendMessage(
      message.chat.id,
      [
        "<b>Дайджест Платформы Сейл Трекер</b>",
        "",
        "/digest — проверить статус выпуска",
        "/settings — показать настройки",
        "/help — помощь",
      ].join("\n"),
      { parseMode: "HTML" },
    );
  } else {
    const subscription = await dependencies.subscriptions.findByTelegramChatId(
      message.chat.id,
    );

    if (!subscription) {
      await dependencies.gateway.sendMessage(
        message.chat.id,
        "Сначала подключите подписку по персональной ссылке с сайта SaleTracker.",
      );
    } else if (parsed.command === "settings") {
      await dependencies.gateway.sendMessage(
        message.chat.id,
        settingsMessage(subscription),
        { parseMode: "HTML" },
      );
    } else {
      const delivery = await dependencies.deliveries.findBySubscriptionId(
        subscription.id,
      );
      const messageByStatus = {
        "waiting-telegram":
          "Telegram подключён. Выпуск готовится к редакционной проверке.",
        ready:
          "Ваш персональный выпуск подготовлен и ожидает отправки редактором.",
        sending: "Выпуск отправляется. Он появится в чате через несколько секунд.",
        sent: "Последний персональный выпуск уже отправлен в этот чат.",
        failed:
          "При отправке возникла техническая ошибка. Редакция уже может повторить отправку.",
      } as const;

      await dependencies.gateway.sendMessage(
        message.chat.id,
        delivery
          ? messageByStatus[delivery.status]
          : "Ваш персональный выпуск находится в редакционной очереди.",
      );
    }
  }

  await dependencies.updates.markProcessed(update.update_id);
  return "processed";
}
