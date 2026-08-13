import { NextResponse } from "next/server";
import { z } from "zod";

import {
  adminSessionCookie,
  authenticateAdmin,
  clearAdminSessionCookie,
  isAdminAuthConfigured,
} from "@/features/admin/admin-auth";

const loginSchema = z.object({
  password: z.string().min(12).max(256),
});

export async function POST(request: Request) {
  if (!isAdminAuthConfigured()) {
    return NextResponse.json(
      {
        title: "ADMIN_AUTH_NOT_CONFIGURED",
        status: 503,
        detail: "Настройте ADMIN_PASSWORD и SESSION_SECRET на сервере.",
      },
      { status: 503 },
    );
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  const token = parsed.success ? authenticateAdmin(parsed.data.password) : null;

  if (!token) {
    return NextResponse.json(
      {
        title: "INVALID_CREDENTIALS",
        status: 401,
        detail: "Неверный пароль администратора.",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ data: { role: "admin" } });
  response.cookies.set(adminSessionCookie(token));
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ data: { signedOut: true } });
  response.cookies.set(clearAdminSessionCookie());
  return response;
}
