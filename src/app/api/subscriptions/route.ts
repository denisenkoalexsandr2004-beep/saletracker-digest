import { prepareDigestDelivery } from "@/features/deliveries/digest-delivery.service";
import { createSubscription } from "@/features/subscriptions/subscription.service";
import { subscriptionSchema } from "@/features/subscriptions/subscription.schema";
import { startTelegramPollingLoop } from "@/features/telegram/telegram.polling-loop";
import { env } from "@/shared/config/env";
import {
  internalError,
  validationError,
} from "@/shared/http/api-response";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json().catch(() => null);
    const parsed = subscriptionSchema.safeParse(payload);

    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const result = await createSubscription(parsed.data, {
      appUrl: env.APP_URL,
      telegramBotUsername: env.TELEGRAM_BOT_TOKEN
        ? env.TELEGRAM_BOT_USERNAME
        : undefined,
    });
    await prepareDigestDelivery(result.id);

    if (result.integrationMode === "telegram") {
      startTelegramPollingLoop();
    }

    return Response.json(
      {
        data: result,
        message:
          result.integrationMode === "telegram"
            ? "Настройки сохранены. Подключите Telegram."
            : "Настройки сохранены. Telegram работает в деморежиме.",
      },
      { status: 201 },
    );
  } catch {
    return internalError();
  }
}
