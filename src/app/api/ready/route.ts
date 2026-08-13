import { NextResponse } from "next/server";

import { isAdminAuthConfigured } from "@/features/admin/admin-auth";
import { checkDatabase } from "@/shared/database/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const database = await checkDatabase();
  const checks = {
    database,
    adminAuth: {
      configured: isAdminAuthConfigured(),
      status: isAdminAuthConfigured() ? "ok" : "error",
    },
  };
  const ready =
    database.configured &&
    database.status === "ok" &&
    checks.adminAuth.configured;

  return NextResponse.json(
    {
      status: ready ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
