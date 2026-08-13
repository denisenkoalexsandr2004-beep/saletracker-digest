import { NextResponse } from "next/server";

import { requireAdminApi } from "@/features/admin/admin-auth";
import {
  MaterialWorkflowError,
  promoteCandidateToReview,
} from "@/features/materials/material.service";

interface PromotionRouteProps {
  params: Promise<{ candidateId: string }>;
}

export async function POST(request: Request, { params }: PromotionRouteProps) {
  const unauthorized = requireAdminApi(request);

  if (unauthorized) {
    return unauthorized;
  }

  const { candidateId } = await params;

  try {
    const material = await promoteCandidateToReview(candidateId);
    return NextResponse.json({ data: material }, { status: 201 });
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
