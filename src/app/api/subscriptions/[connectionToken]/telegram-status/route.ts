import { NextResponse } from "next/server";

import { getDigestDeliveryRepository } from "@/features/deliveries/digest-delivery.repository";
import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import { TelegramApiError } from "@/features/telegram/telegram.client";
import { pollTelegramUpdatesOnce } from "@/features/telegram/telegram.polling";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";

interface TelegramStatusRouteProps {
  params: Promise<{ connectionToken: string }>;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: TelegramStatusRouteProps,
) {
  const { connectionToken } = await params;
  const subscriptions = getSubscriptionRepository();
  const existing = await subscriptions.findByConnectionToken(connectionToken);

  if (!existing) {
    return NextResponse.json(
      {
        title: "SUBSCRIPTION_NOT_FOUND",
        status: 404,
        detail:
          "Заявка не найдена. Если сервер перезапускался, настройте выпуск ещё раз.",
        instance: new URL(request.url).pathname,
      },
      { status: 404 },
    );
  }

  const client = getTelegramClient();

  if (!client) {
    return NextResponse.json(
      {
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram-бот не настроен на сервере.",
        instance: new URL(request.url).pathname,
      },
      { status: 503 },
    );
  }

  try {
    await pollTelegramUpdatesOnce(client);
  } catch (error) {
    return NextResponse.json(
      {
        title:
          error instanceof TelegramApiError
            ? "TELEGRAM_UPSTREAM_ERROR"
            : "INTERNAL_ERROR",
        status: 502,
        detail: "Не удалось проверить подключение Telegram.",
        instance: new URL(request.url).pathname,
      },
      { status: 502 },
    );
  }

  const subscription =
    (await subscriptions.findByConnectionToken(connectionToken)) ?? existing;
  const delivery = await getDigestDeliveryRepository().findBySubscriptionId(
    subscription.id,
  );

  return NextResponse.json({
    data: {
      connected: Boolean(subscription.telegram),
      deliveryStatus: delivery?.status ?? "waiting-telegram",
    },
  });
}
