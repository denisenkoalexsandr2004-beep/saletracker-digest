import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  DigestDeliveryError,
  setDigestDeliveryItems,
  toDigestDeliveryView,
} from "@/features/deliveries/digest-delivery.service";
import { getSubscriptionRepository } from "@/features/subscriptions/subscription.repository";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  itemIds: z
    .array(z.string().trim().min(1).max(120))
    .max(30, "В выпуске не может быть больше 30 материалов")
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Материалы не должны повторяться",
    }),
});

interface DeliveryRouteProps {
  params: Promise<{ deliveryId: string }>;
}

export async function PATCH(request: Request, { params }: DeliveryRouteProps) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      {
        title: "VALIDATION_ERROR",
        status: 422,
        detail: "Передайте список itemIds без повторов, до 30 материалов.",
      },
      { status: 422 },
    );
  }

  const { deliveryId } = await params;

  try {
    const delivery = await setDigestDeliveryItems(
      deliveryId,
      parsed.data.itemIds,
    );
    const subscription = await getSubscriptionRepository().findById(
      delivery.subscriptionId,
    );

    if (!subscription) {
      return NextResponse.json(
        {
          title: "SUBSCRIPTION_NOT_FOUND",
          status: 404,
          detail: "Подписчик выпуска не найден.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      data: toDigestDeliveryView(delivery, subscription),
    });
  } catch (error) {
    if (error instanceof DigestDeliveryError) {
      const status = error.code === "DELIVERY_NOT_FOUND" ? 404 : 409;
      return NextResponse.json(
        { title: error.code, status, detail: error.message },
        { status },
      );
    }

    return NextResponse.json(
      {
        title: "INTERNAL_ERROR",
        status: 500,
        detail: "Не удалось сохранить состав выпуска.",
      },
      { status: 500 },
    );
  }
}
