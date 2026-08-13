import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  listDigestDeliveryViews,
  synchronizeDigestDeliveries,
} from "@/features/deliveries/digest-delivery.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  await synchronizeDigestDeliveries();
  const deliveries = await listDigestDeliveryViews(20);

  return Response.json({
    data: deliveries,
    meta: {
      count: deliveries.length,
      generatedAt: new Date().toISOString(),
    },
  });
}
