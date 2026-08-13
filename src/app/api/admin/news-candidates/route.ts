import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  getNewsCandidateRepository,
} from "@/features/news-ingestion/news-candidate.repository";
import { getNewsAgentConfiguration } from "@/features/news-ingestion/openai-news-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const repository = getNewsCandidateRepository();
  const [candidates, runs] = await Promise.all([
    repository.listCandidates(),
    repository.listRuns(),
  ]);

  return Response.json({
    data: candidates,
    runs,
    configuration: getNewsAgentConfiguration(),
  });
}
