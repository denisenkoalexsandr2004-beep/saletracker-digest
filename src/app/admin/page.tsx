import type { Metadata } from "next";

import { requireAdminPage } from "@/features/admin/admin-auth";
import {
  listDigestDeliveryViews,
  synchronizeDigestDeliveries,
} from "@/features/deliveries/digest-delivery.service";
import { AdminConsole } from "@/features/admin/components/admin-console";
import {
  getNewsCandidateRepository,
} from "@/features/news-ingestion/news-candidate.repository";
import { getNewsAiUsageRepository } from "@/features/news-ingestion/news-ai-usage.repository";
import { getNewsAgentConfiguration } from "@/features/news-ingestion/openai-news-agent";
import { newsSourceRegistry } from "@/features/news-sources/news-source.registry";
import { getMaterialRepository } from "@/features/materials/material.repository";
import { demoEvents } from "@/shared/demo-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Редакторская админка",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  await requireAdminPage();
  await synchronizeDigestDeliveries();
  const [deliveries, candidates, materials, aiUsage] = await Promise.all([
    listDigestDeliveryViews(20),
    getNewsCandidateRepository().listCandidates(),
    getMaterialRepository().list(),
    getNewsAiUsageRepository().getSummary(),
  ]);

  return (
    <AdminConsole
      agentConfiguration={getNewsAgentConfiguration()}
      initialCandidates={candidates}
      initialAiUsage={aiUsage}
      initialMaterials={materials}
      initialDeliveries={deliveries}
      events={demoEvents}
      sources={newsSourceRegistry}
    />
  );
}
