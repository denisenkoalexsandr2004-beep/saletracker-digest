import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { env } from "@/shared/config/env";

const ADMIN_COOKIE = "saletracker_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

interface AdminSessionPayload {
  role: "admin";
  expiresAt: number;
}

function getCredentials(): { password: string; signingSecret: string } | null {
  const password = env.ADMIN_PASSWORD ?? env.TELEGRAM_ADMIN_SECRET;
  const signingSecret = env.SESSION_SECRET ?? env.TELEGRAM_ADMIN_SECRET;

  return password && signingSecret ? { password, signingSecret } : null;
}

function equalStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSessionToken(
  secret: string,
  now = Date.now(),
): string {
  const payload: AdminSessionPayload = {
    role: "admin",
    expiresAt: now + SESSION_TTL_SECONDS * 1_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) {
    return false;
  }

  const [encoded, signature, extra] = token.split(".");

  if (!encoded || !signature || extra || !equalStrings(signature, sign(encoded, secret))) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<AdminSessionPayload>;
    return payload.role === "admin" && Number(payload.expiresAt) > now;
  } catch {
    return false;
  }
}

export function isAdminAuthConfigured(): boolean {
  return Boolean(getCredentials());
}

export function authenticateAdmin(password: string): string | null {
  const credentials = getCredentials();

  if (!credentials || !equalStrings(password, credentials.password)) {
    return null;
  }

  return createAdminSessionToken(credentials.signingSecret);
}

export function adminSessionCookie(token: string) {
  return {
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: new URL(env.APP_URL).protocol === "https:",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearAdminSessionCookie() {
  return { ...adminSessionCookie(""), maxAge: 0 };
}

export async function hasAdminPageSession(): Promise<boolean> {
  const credentials = getCredentials();

  if (!credentials) {
    return false;
  }

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyAdminSessionToken(token, credentials.signingSecret);
}

export async function requireAdminPage(): Promise<void> {
  if (!(await hasAdminPageSession())) {
    redirect("/admin/login");
  }
}

export function requireAdminApi(request: Request): NextResponse | null {
  const credentials = getCredentials();

  if (!credentials) {
    return NextResponse.json(
      {
        title: "ADMIN_AUTH_NOT_CONFIGURED",
        status: 503,
        detail:
          "Настройте ADMIN_PASSWORD и SESSION_SECRET на сервере.",
      },
      { status: 503 },
    );
  }

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === ADMIN_COOKIE)?.[1];

  if (!verifyAdminSessionToken(token, credentials.signingSecret)) {
    return NextResponse.json(
      {
        title: "UNAUTHORIZED",
        status: 401,
        detail: "Требуется действующая сессия администратора.",
      },
      { status: 401 },
    );
  }

  return null;
}
