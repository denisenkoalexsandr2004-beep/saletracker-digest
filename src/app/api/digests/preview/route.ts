import { NextResponse } from "next/server";

import { buildDigestIssue } from "@/features/digests/digest.service";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

export const dynamic = "force-dynamic";

export function GET() {
  const issue = buildDigestIssue({
    role: "supplier",
    tags: ["Молочная продукция", "СТМ", "Логистика"],
    targetSize: 10,
    frequency: "twice-weekly",
    since: "2026-07-14T00:00:00+03:00",
    materials: demoMaterials,
    events: demoEvents,
    now: "2026-07-24T12:00:00+03:00",
  });

  return NextResponse.json({ data: issue });
}
