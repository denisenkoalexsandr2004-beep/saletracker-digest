import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  title: string;
  status: number;
  detail: string;
  fields?: Record<string, string>;
}

export function validationError(error: ZodError): NextResponse<ApiErrorBody> {
  const fields = Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );

  return NextResponse.json(
    {
      title: "VALIDATION_ERROR",
      status: 422,
      detail: "Проверьте заполненные поля.",
      fields,
    },
    { status: 422 },
  );
}

export function internalError(): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    {
      title: "INTERNAL_ERROR",
      status: 500,
      detail: "Не удалось выполнить запрос. Попробуйте ещё раз.",
    },
    { status: 500 },
  );
}
