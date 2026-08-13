import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  changeMaterialStatus,
  MaterialWorkflowError,
} from "@/features/materials/material.service";

const inputSchema = z.object({
  status: z.enum(["draft", "review", "approved"]),
});

interface MaterialRouteProps {
  params: Promise<{ materialId: string }>;
}

export async function PATCH(request: Request, { params }: MaterialRouteProps) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      {
        title: "VALIDATION_ERROR",
        status: 422,
        detail: "Разрешены статусы draft, review и approved.",
      },
      { status: 422 },
    );
  }

  const { materialId } = await params;

  try {
    const material = await changeMaterialStatus(materialId, parsed.data.status);
    return NextResponse.json({ data: material });
  } catch (error) {
    if (error instanceof MaterialWorkflowError) {
      return NextResponse.json(
        { title: error.code, status: 404, detail: error.message },
        { status: 404 },
      );
    }

    throw error;
  }
}
