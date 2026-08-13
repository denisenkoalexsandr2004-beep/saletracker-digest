import { NextResponse } from "next/server";

import {
  getBearerToken,
  secureEquals,
} from "@/features/telegram/telegram.security";
import { env } from "@/shared/config/env";

export function requireCronRequest(request: Request): NextResponse | null {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      {
        title: "CRON_NOT_CONFIGURED",
        status: 503,
        detail: "На сервере не задан CRON_SECRET.",
      },
      { status: 503 },
    );
  }

  if (!secureEquals(getBearerToken(request), env.CRON_SECRET)) {
    return NextResponse.json(
      {
        title: "UNAUTHORIZED",
        status: 401,
        detail: "Неверный секрет планировщика.",
      },
      { status: 401 },
    );
  }

  return null;
}
