import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import postgres from "postgres";

const baseUrl = process.env.LIVE_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const adminPassword =
  process.env.ADMIN_PASSWORD ?? process.env.TELEGRAM_ADMIN_SECRET;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const loops = Number(process.env.LIVE_E2E_LOOPS ?? "3");
const artifactDirectory = new URL("../artifacts/live-e2e/", import.meta.url);

for (const [name, value] of Object.entries({
  adminPassword,
  webhookSecret,
  databaseUrl,
})) {
  if (!value) {
    throw new Error(`${name} is required for the live E2E test.`);
  }
}

if (!Number.isInteger(loops) || loops < 1 || loops > 5) {
  throw new Error("LIVE_E2E_LOOPS must be an integer from 1 through 5.");
}

const scenarios = [
  {
    role: "Поставщик",
    tags: ["СТМ", "Чай и кофе", "Логистика"],
    frequency: "Каждый день",
    size: 5,
  },
  {
    role: "Закупщик",
    tags: ["E-commerce", "Retail Tech", "Одежда и обувь"],
    frequency: "Два раза в неделю",
    size: 5,
  },
  {
    role: "Закупки и поставки",
    tags: ["Молочная продукция", "Мясо и птица", "Здоровое питание"],
    frequency: "Раз в неделю",
    size: 5,
  },
];

await mkdir(fileURLToPath(artifactDirectory), { recursive: true });

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const [telegramIdentity] = await sql`
  select chat_id, user_id, username, first_name
  from telegram_accounts
  order by connected_at desc
  limit 1
`;

if (!telegramIdentity) {
  await sql.end();
  throw new Error(
    "No existing Telegram chat is available. Open the bot and press Start once.",
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const stamp = Date.now();
const report = [];

page.on("pageerror", (error) => {
  throw error;
});

async function selectTags(tags) {
  const tagList = page.locator('[aria-label="Интересы"]');
  const selected = tagList.locator('button[aria-pressed="true"]');

  for (const label of await selected.allTextContents()) {
    if (!tags.includes(label.trim())) {
      await tagList.getByRole("button", { name: label.trim(), exact: true }).click();
    }
  }

  const search = page.getByRole("searchbox", { name: "Поиск по категориям" });

  for (const tag of tags) {
    await search.fill(tag);
    const button = tagList.getByRole("button", { name: tag, exact: true });

    if ((await button.getAttribute("aria-pressed")) !== "true") {
      await button.click();
    }
  }

  await search.fill("");
  const summary = page.locator(".builder-submit p");

  await page.waitForFunction(
    (expectedTags) => {
      const text = document.querySelector(".builder-submit p")?.textContent ?? "";
      return expectedTags.every((tag) => text.includes(tag));
    },
    tags,
  );
  const summaryText = (await summary.textContent()) ?? "";

  for (const tag of tags) {
    assert.ok(summaryText.includes(tag), `Selected tag is missing: ${tag}`);
  }
}

async function createSubscription(cycle, scenario) {
  const company = `SaleTracker Live E2E ${stamp}-${cycle}`;
  await page.goto(`${baseUrl}/#setup`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: scenario.role, exact: true }).click();
  await selectTags(scenario.tags);
  await page
    .getByRole("radio", { name: scenario.frequency, exact: true })
    .click();
  await page
    .getByRole("radio", {
      name: `${scenario.size} новостей`,
      exact: true,
    })
    .click();
  await page.getByLabel("Имя").fill(`Сквозной тест ${cycle}`);
  await page.getByLabel("Компания").fill(company);
  await page
    .getByLabel("Рабочий email")
    .fill(`live-e2e-${stamp}-${cycle}@example.ru`);
  await page
    .getByLabel(
      "Согласен на обработку данных и получение выбранных материалов.",
    )
    .check();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${baseUrl}/api/subscriptions` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Получить дайджест" }).click();
  const response = await responsePromise;
  const body = await response.json();

  assert.equal(response.status(), 201, JSON.stringify(body));
  assert.equal(body.data.integrationMode, "telegram");
  assert.match(body.data.nextStepUrl, /^https:\/\/t\.me\//);
  await page.locator(".form-message--success").waitFor();
  await page.screenshot({
    path: fileURLToPath(
      new URL(`cycle-${cycle}-subscription.png`, artifactDirectory),
    ),
    fullPage: true,
  });

  return {
    company,
    subscriptionId: body.data.id,
    connectionToken: body.data.connectionToken,
  };
}

async function openAdmin() {
  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });

  if (new URL(page.url()).pathname === "/admin/login") {
    await page.getByLabel("Пароль администратора").fill(adminPassword);
    await page.getByRole("button", { name: "Войти в редакцию" }).click();
    await page.waitForURL(`${baseUrl}/admin`);
    await page.waitForLoadState("networkidle");
  }

  await page.getByRole("heading", { name: "Пульт выпусков" }).waitFor();
}

async function collectNews(cycle) {
  await openAdmin();
  await page.getByRole("button", { name: /Источники и AI ·/ }).click();
  const button = page.getByRole("button", {
    name: "Собрать новости из лент",
  });
  const bodies = [];
  const listener = async (response) => {
    if (
      response.url() === `${baseUrl}/api/admin/ingestion-runs` &&
      response.request().method() === "POST"
    ) {
      bodies.push({ status: response.status(), body: await response.json() });
    }
  };
  page.on("response", listener);
  const firstResponse = page.waitForResponse(
    (response) =>
      response.url() === `${baseUrl}/api/admin/ingestion-runs` &&
      response.request().method() === "POST",
    { timeout: 15 * 60_000 },
  );
  await button.click();
  await firstResponse;
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("button")).some(
        (candidate) =>
          candidate.textContent?.trim() === "Собрать новости из лент" &&
          !candidate.disabled,
      ),
    undefined,
    { timeout: 15 * 60_000 },
  );
  page.off("response", listener);
  assert.ok(bodies.length >= 1, "The admin collection must call ingestion.");
  await page.screenshot({
    path: fileURLToPath(
      new URL(`cycle-${cycle}-ingestion.png`, artifactDirectory),
    ),
    fullPage: true,
  });

  return bodies.map(({ status, body }) => ({
    status,
    accepted: body.data?.diagnostics?.accepted ?? 0,
    found: body.data?.diagnostics?.entriesFound ?? 0,
    queued: body.data?.diagnostics?.entriesQueued ?? 0,
    reviewed: body.data?.diagnostics?.entriesReviewed ?? 0,
    failed: body.data?.diagnostics?.failed ?? 0,
    pending: body.data?.diagnostics?.queue?.pending ?? 0,
  }));
}

async function promoteAndApproveMaterials(target = 10) {
  await openAdmin();
  await page.getByRole("button", { name: /Источники и AI ·/ }).click();
  let promoted = 0;

  while (promoted < target) {
    const button = page
      .getByRole("button", { name: "Передать редактору", exact: true })
      .first();

    if ((await button.count()) === 0) {
      break;
    }

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/news-candidates/") &&
        response.url().endsWith("/promotions") &&
        response.request().method() === "POST",
    );
    await button.click();
    const response = await responsePromise;
    assert.equal(response.status(), 201, await response.text());
    promoted += 1;
  }

  await page.getByRole("button", { name: /Материалы ·/ }).click();
  const approveButtons = page.locator('button[aria-label^="Утвердить:"]');
  const approveCount = Math.min(await approveButtons.count(), target);

  for (let index = 0; index < approveCount; index += 1) {
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/materials/") &&
        response.request().method() === "PATCH",
    );
    await approveButtons.nth(index).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200, await response.text());
  }

  const [approved] = await sql`
    select count(*)::int as count from materials where status = 'approved'
  `;
  assert.ok(approved.count > 0, "At least one material must be approved.");
  return { promoted, approved: approved.count };
}

async function connectTelegramAndDispatch(cycle, subscription) {
  const updateId = stamp + cycle;
  const response = await context.request.post(
    `${baseUrl}/api/telegram/webhook`,
    {
      headers: {
        "x-telegram-bot-api-secret-token": webhookSecret,
      },
      data: {
        update_id: updateId,
        message: {
          message_id: 900_000_000 + cycle,
          from: {
            id: Number(telegramIdentity.user_id),
            is_bot: false,
            first_name: telegramIdentity.first_name,
            username: telegramIdentity.username ?? undefined,
          },
          chat: {
            id: Number(telegramIdentity.chat_id),
            type: "private",
          },
          date: Math.floor(Date.now() / 1_000),
          text: `/start ${subscription.connectionToken}`,
        },
      },
      timeout: 5 * 60_000,
    },
  );
  const body = await response.json();
  assert.equal(response.status(), 200, JSON.stringify(body));
  assert.equal(body.data.status, "processed");

  const statusResponse = await context.request.post(
    `${baseUrl}/api/subscriptions/${subscription.connectionToken}/telegram-status`,
  );
  const statusBody = await statusResponse.json();
  assert.equal(statusResponse.status(), 200, JSON.stringify(statusBody));
  assert.equal(statusBody.data.connected, true);
  assert.equal(statusBody.data.deliveryStatus, "sent");

  const [delivery] = await sql`
    select id, status, issue
    from digest_deliveries
    where subscription_id = ${subscription.subscriptionId}
    order by created_at desc
    limit 1
  `;
  assert.equal(delivery.status, "sent");
  assert.ok(delivery.issue.items.length > 0, "The Telegram digest is empty.");
  const [messages] = await sql`
    select count(*)::int as total,
           count(*) filter (where status = 'sent')::int as sent
    from delivery_messages
    where delivery_id = ${delivery.id}
  `;
  assert.equal(messages.sent, messages.total);
  assert.ok(messages.sent > 0, "No Telegram message checkpoints were sent.");

  await openAdmin();
  const card = page.locator(".subscriber-card").filter({
    hasText: subscription.company,
  });
  await card.getByText("Отправлен", { exact: true }).waitFor();
  await page.screenshot({
    path: fileURLToPath(
      new URL(`cycle-${cycle}-telegram-sent.png`, artifactDirectory),
    ),
    fullPage: true,
  });

  return {
    itemCount: delivery.issue.items.length,
    telegramMessages: messages.sent,
  };
}

try {
  for (let index = 0; index < loops; index += 1) {
    const cycle = index + 1;
    const scenario = scenarios[index % scenarios.length];
    const subscription = await createSubscription(cycle, scenario);
    const ingestion = await collectNews(cycle);
    let editorial = null;

    if (cycle === 1) {
      editorial = await promoteAndApproveMaterials(10);
    }

    const delivery = await connectTelegramAndDispatch(cycle, subscription);
    report.push({
      cycle,
      company: subscription.company,
      tags: scenario.tags,
      ingestion,
      editorial,
      delivery,
    });
  }
} finally {
  await context.close();
  await browser.close();
  await sql.end();
}

console.log(JSON.stringify({ status: "passed", loops, report }, null, 2));
