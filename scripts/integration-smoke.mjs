import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error("SMOKE_ADMIN_PASSWORD is required.");
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), options);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

function expectStatus(result, status, label) {
  assert.equal(
    result.response.status,
    status,
    `${label}: expected ${status}, received ${result.response.status}: ${JSON.stringify(result.body)}`,
  );
}

const checks = [];

async function check(label, run) {
  await run();
  checks.push(label);
}

await check("health endpoint", async () => {
  const result = await request("/api/health");
  expectStatus(result, 200, "health");
  assert.equal(result.body.status, "ok");
  assert.equal(result.body.mode, "demo");
  assert.equal(result.body.adminAuth, "configured");
});

await check("readiness reports missing persistent database", async () => {
  const result = await request("/api/ready");
  expectStatus(result, 503, "ready");
  assert.equal(result.body.status, "degraded");
  assert.equal(result.body.checks.database.status, "disabled");
  assert.equal(result.body.checks.appUrl.status, "error");
  assert.equal(result.body.checks.telegram.status, "error");
  assert.equal(result.body.checks.scheduler.status, "error");
  assert.equal(result.body.checks.newsAgent.status, "error");
  assert.equal(result.body.checks.newsFreshness.status, "error");
});

await check("admin API rejects anonymous requests", async () => {
  const result = await request("/api/admin/digest-deliveries");
  expectStatus(result, 401, "anonymous admin API");
  assert.equal(result.body.title, "UNAUTHORIZED");
});

await check("subscription API rejects invalid input", async () => {
  const result = await request("/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ consent: false }),
  });
  expectStatus(result, 422, "invalid subscription");
  assert.equal(result.body.title, "VALIDATION_ERROR");
});

let subscription;

await check("subscription API creates a personalized digest request", async () => {
  const result = await request("/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Сквозной Тест",
      company: "SaleTracker Smoke",
      email: "smoke@example.ru",
      role: "supplier",
      tags: ["Молочная продукция", "СТМ", "Логистика"],
      frequency: "daily",
      targetSize: 10,
      consent: true,
    }),
  });
  expectStatus(result, 201, "valid subscription");
  subscription = result.body.data;
  assert.equal(subscription.integrationMode, "demo");
  assert.match(subscription.connectionToken, /^[0-9a-f-]{36}$/i);
  assert.equal(
    subscription.nextStepUrl,
    `${baseUrl}/preview?token=${subscription.connectionToken}`,
  );
});

await check("Telegram status rejects an unconfigured gateway", async () => {
  const result = await request(
    `/api/subscriptions/${subscription.connectionToken}/telegram-status`,
    { method: "POST" },
  );
  expectStatus(result, 503, "Telegram status");
  assert.equal(result.body.title, "TELEGRAM_NOT_CONFIGURED");
});

await check("admin login rejects a wrong password", async () => {
  const result = await request("/api/admin/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong-password-value" }),
  });
  expectStatus(result, 401, "wrong admin password");
  assert.equal(result.body.title, "INVALID_CREDENTIALS");
});

let adminCookie;

await check("admin login creates a hardened session cookie", async () => {
  const result = await request("/api/admin/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  expectStatus(result, 200, "admin login");
  const setCookie = result.response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /saletracker_admin_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  adminCookie = setCookie.split(";", 1)[0];
});

await check("admin sees the created subscriber and exact digest", async () => {
  const result = await request("/api/admin/digest-deliveries", {
    headers: { cookie: adminCookie },
  });
  expectStatus(result, 200, "authenticated deliveries");
  const delivery = result.body.data.find(
    (item) => item.subscriber.company === "SaleTracker Smoke",
  );
  assert.ok(delivery, "created subscriber must be visible in the admin queue");
  assert.equal(delivery.status, "waiting-telegram");
  assert.equal(delivery.subscriber.targetSize, 10);
  assert.equal(
    delivery.issue.items.length,
    0,
    "stale demo fixtures must never be sent as current news",
  );
  assert.ok(
    delivery.issue.items.every((item) => item.sourceUrls.length > 0),
    "every digest item must retain a direct source URL",
  );
});

await check("AI endpoint explains missing credentials", async () => {
  const result = await request("/api/admin/ingestion-runs", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ days: 7, maxCandidates: 5 }),
  });
  expectStatus(result, 503, "AI ingestion without key");
  assert.equal(result.body.title, "OPENAI_NOT_CONFIGURED");
});

await check("cron endpoint is closed without its server secret", async () => {
  const result = await request("/api/jobs/digest-dispatch", {
    method: "POST",
  });
  expectStatus(result, 503, "cron without secret");
  assert.equal(result.body.title, "CRON_NOT_CONFIGURED");
});

console.log(`Integration smoke passed: ${checks.length} checks.`);
for (const label of checks) {
  console.log(`- ${label}`);
}
