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
  groupOffset: z.number().int().min(0).max(20).optional(),
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
    const { diagnostics } = result;
    const rejectionSummary = [
      ...new Set(diagnostics.rejected.flatMap((item) => item.reasons)),
    ].join(", ");

    return NextResponse.json({
      data: result,
      message: diagnostics.accepted
        ? `Собрано кандидатов: ${diagnostics.accepted}. Все ждут редакторской проверки.`
        : diagnostics.returnedByModel
          ? `Агент нашёл ${diagnostics.returnedByModel}, но проверку не прошёл никто. Причины: ${rejectionSummary}.`
          : "Агент не нашёл материалов по этой группе источников.",
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

    // Раньше причина терялась здесь целиком, и в админке оставался безликий
    // текст. Эндпоинт закрыт сессией редактора, поэтому подробность безопасна.
    console.error("[ingestion-runs] unexpected failure", error);

    return NextResponse.json(
      {
        title: "INTERNAL_ERROR",
        status: 500,
        detail: `Не удалось запустить сбор новостей. ${
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Неизвестная ошибка."
        }`,
      },
      { status: 500 },
    );
  }
}
