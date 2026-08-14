import { NextResponse } from "next/server";

import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  DigestDeliveryError,
  dispatchDigestDelivery,
  toDigestDeliveryView,
} from "@/features/deliveries/digest-delivery.service";
import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";
import { getTelegramClient } from "@/features/telegram/telegram.runtime";
import { env } from "@/shared/config/env";
import { internalError } from "@/shared/http/api-response";

interface DispatchRouteProps {
  params: Promise<{ deliveryId: string }>;
}

export const dynamic = "force-dynamic";

function deliveryError(
  error: DigestDeliveryError,
  instance: string,
): NextResponse {
  const statusByCode = {
    DELIVERY_NOT_FOUND: 404,
    TELEGRAM_NOT_CONNECTED: 409,
    DELIVERY_IN_PROGRESS: 409,
    EMPTY_DIGEST: 422,
  } as const;
  const status = statusByCode[error.code];

  return NextResponse.json(
    {
      type: `https://saletracker.local/errors/${error.code.toLowerCase()}`,
      title: error.code,
      status,
      detail: error.message,
      instance,
    },
    { status },
  );
}

export async function POST(request: Request, { params }: DispatchRouteProps) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { deliveryId } = await params;
  const client = getTelegramClient();

  if (!client) {
    return NextResponse.json(
      {
        type: "https://saletracker.local/errors/telegram-not-configured",
        title: "TELEGRAM_NOT_CONFIGURED",
        status: 503,
        detail: "Telegram-бот не настроен на сервере.",
        instance: new URL(request.url).pathname,
      },
      { status: 503 },
    );
  }

  try {
    const result = await dispatchDigestDelivery(deliveryId, {
      gateway: client,
      appUrl: env.APP_URL,
      now: () => new Date().toISOString(),
    });
    const subscription = await getSubscriptionRepository().findById(
      result.delivery.subscriptionId,
    );

    if (!subscription) {
      return internalError();
    }

    return Response.json({
      data: toDigestDeliveryView(result.delivery, subscription),
      meta: {
        alreadySent: result.alreadySent,
      },
    });
  } catch (error) {
    if (error instanceof DigestDeliveryError) {
      return deliveryError(error, new URL(request.url).pathname);
    }

    return internalError();
  }
}
