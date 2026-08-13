import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  NewsAgentError,
  runNewsAgent,
} from "@/features/news-ingestion/openai-news-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({
  days: z.number().int().min(1).max(31).default(7),
  maxCandidates: z.number().int().min(1).max(12).default(8),
  sourceIds: z.array(z.string().trim().min(1)).max(100).optional(),
});

export async function POST(request: Request) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const input = inputSchema.safeParse(payload);

  if (!input.success) {
    return NextResponse.json(
      {
        title: "VALIDATION_ERROR",
        status: 422,
        detail: "Проверьте период, лимит и выбранные источники.",
      },
      { status: 422 },
    );
  }

  try {
    const result = await runNewsAgent(input.data);
    return NextResponse.json({
      data: result,
      message: `Собрано кандидатов: ${result.candidates.length}. Все ждут редакторской проверки.`,
    });
  } catch (error) {
    if (error instanceof NewsAgentError) {
      return NextResponse.json(
        {
          title: error.code,
          status: error.status,
          detail: error.message,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        title: "INTERNAL_ERROR",
        status: 500,
        detail: "Не удалось запустить сбор новостей.",
      },
      { status: 500 },
    );
  }
}
