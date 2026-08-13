import { NextResponse } from "next/server";

import { isAdminAuthConfigured } from "@/features/admin/admin-auth";
import { isDatabaseConfigured } from "@/shared/database/client";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "saletracker-digest",
    mode: isDatabaseConfigured() ? "persistent" : "demo",
    adminAuth: isAdminAuthConfigured() ? "configured" : "missing",
    timestamp: new Date().toISOString(),
  });
}
