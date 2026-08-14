import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const adminPassword = process.env.VISUAL_ADMIN_PASSWORD;
const outputDir = new URL("../artifacts/visual/", import.meta.url);

const scenarios = [
  { name: "home", path: "/" },
  { name: "preview", path: "/preview" },
  { name: "admin", path: "/admin" },
];

const devices = [
  { name: "desktop", viewport: { width: 1440, height: 1000 } },
  { name: "mobile", viewport: { width: 390, height: 844 } },
];

await mkdir(fileURLToPath(outputDir), { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const device of devices) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location().url;
        failures.push(
          `${device.name}: console: ${message.text()}${location ? ` · ${location}` : ""}`,
        );
      }
    });
    page.on("pageerror", (error) => {
      failures.push(`${device.name}: pageerror: ${error.message}`);
    });

    for (const scenario of scenarios) {
      const response = await page.goto(`${baseUrl}${scenario.path}`, {
        waitUntil: "networkidle",
      });

      if (!response?.ok()) {
        failures.push(
          `${device.name}/${scenario.name}: HTTP ${response?.status() ?? "?"}`,
        );
      }

      if (
        scenario.name === "admin" &&
        new URL(page.url()).pathname === "/admin/login"
      ) {
        if (!adminPassword) {
          throw new Error(
            "VISUAL_ADMIN_PASSWORD is required to test the protected admin UI.",
          );
        }

        await page
          .getByLabel("Пароль администратора")
          .fill(adminPassword);
        await page
          .getByRole("button", { name: "Войти в редакцию" })
          .click();
        await page.waitForURL(`${baseUrl}/admin`);
        await page.waitForLoadState("networkidle");
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );

      if (overflow > 1) {
        const offenders = await page.evaluate(() =>
          Array.from(document.querySelectorAll("*"))
            .filter((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.right > window.innerWidth + 1 || bounds.left < -1;
            })
            .slice(0, 5)
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return `${element.tagName.toLowerCase()}.${element.className}: ${Math.round(bounds.left)}..${Math.round(bounds.right)}`;
            }),
        );
        const pseudoTests = await page.evaluate(() =>
          [".hero::before", ".signal-board::after", ".czs-section::before"].map(
            (selector) => {
              const style = document.createElement("style");
              style.textContent = `${selector} { display: none !important; }`;
              document.head.append(style);
              const remaining =
                document.documentElement.scrollWidth - window.innerWidth;
              style.remove();
              return `${selector}=${remaining}px`;
            },
          ),
        );
        const scrollContainers = await page.evaluate(() =>
          [document.documentElement, document.body, ...document.querySelectorAll("*")]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .slice(0, 8)
            .map(
              (element) =>
                `${element.tagName.toLowerCase()}.${element.className}: ${element.clientWidth}/${element.scrollWidth}`,
            ),
        );
        failures.push(
          `${device.name}/${scenario.name}: horizontal overflow ${overflow}px (${offenders.join(", ")}; ${pseudoTests.join(", ")}; ${scrollContainers.join(", ")})`,
        );
      }

      await page.screenshot({
        path: fileURLToPath(
          new URL(`${scenario.name}-${device.name}.png`, outputDir),
        ),
        fullPage: true,
      });

      if (scenario.name === "home") {
        const categorySearch = page.getByRole("searchbox", {
          name: "Поиск по категориям",
        });
        await categorySearch.fill("космет");
        if (
          (await page.getByRole("button", {
            name: "Косметика и парфюмерия",
          }).count()) !== 1
        ) {
          failures.push(
            `${device.name}/home: category search did not find cosmetics`,
          );
        }
        await categorySearch.fill("");

        await page.getByLabel("Имя").fill("Сквозной тест");
        await page.getByLabel("Компания").fill("SaleTracker E2E");
        await page.getByLabel("Рабочий email").fill("e2e@example.ru");
        await page
          .getByLabel(
            "Согласен на обработку данных и получение выбранных материалов.",
          )
          .check();

        await page
          .getByRole("button", { name: "Получить дайджест" })
          .click();
        await page.locator(".form-message--success").waitFor();
      }

      if (scenario.name === "preview") {
        const storyCount = await page.locator(".telegram-story").count();
        const ctaCount = await page.locator(".telegram-cta").count();
        const messageCount = await page.locator(".telegram-message").count();

        if (storyCount !== 10 || ctaCount !== 1 || messageCount !== 3) {
          failures.push(
            `${device.name}/preview: expected 10 stories, 3 messages, 1 CTA; got ${storyCount}/${messageCount}/${ctaCount}`,
          );
        }

        const sourceLink = page
          .locator(".telegram-story-more a")
          .first();
        const sourceHref = await sourceLink.getAttribute("href");

        if (!sourceHref?.includes("retail.ru/news/")) {
          failures.push(
            `${device.name}/preview: Подробнее does not point to the source article`,
          );
        }
      }

      if (scenario.name === "admin") {
        await page
          .getByRole("button", { name: /Материалы ·/ })
          .click();
        await page.getByRole("tab", { name: "На проверке" }).click();
        const reviewRows = await page.locator(".material-row").count();

        if (reviewRows !== 1) {
          failures.push(
            `${device.name}/admin: review filter returned ${reviewRows} rows`,
          );
        }

        await page
          .getByRole("button", { name: /Источники и AI ·/ })
          .click();
        const sourceCount = await page.locator(".source-grid article").count();

        if (sourceCount < 35) {
          failures.push(
            `${device.name}/admin: source registry returned ${sourceCount} rows`,
          );
        }
      }
    }

    await context.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  throw new Error(`Visual smoke check failed:\n${failures.join("\n")}`);
}

console.log("Visual smoke check passed: 6 screenshots, no overflow or page errors.");
