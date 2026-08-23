import { requireAdminApi } from "@/features/admin/admin-auth";
import { getNewsAiUsageRepository } from "@/features/news-ingestion/news-ai-usage.repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const summary = await getNewsAiUsageRepository().getSummary();

  return Response.json({ data: summary });
}
