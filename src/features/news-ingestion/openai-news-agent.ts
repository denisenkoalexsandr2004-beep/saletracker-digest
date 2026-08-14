import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  getNewsCandidateRepository,
} from "@/features/news-ingestion/news-candidate.repository";
import { checkCandidateQuality } from "@/features/news-ingestion/candidate-quality";
import type {
  NewsCandidate,
  NewsIngestionRun,
} from "@/features/news-ingestion/news-candidate.types";
import {
  getAgentSources,
  newsSourceRegistry,
} from "@/features/news-sources/news-source.registry";
import type { NewsSource } from "@/features/news-sources/news-source.types";
import { digestTags } from "@/features/subscriptions/subscription.categories";
import { env } from "@/shared/config/env";

const agentCandidateSchema = z.object({
  title: z.string().trim().min(8).max(180),
  sourceName: z.string().trim().min(2).max(100),
  sourceUrl: z.url(),
  publishedAt: z.iso.datetime({ offset: true }),
  summary: z.string().trim().min(30).max(700),
  marketImpact: z.string().trim().min(30).max(700),
  businessImpact: z.string().trim().min(20).max(500),
  keyMetrics: z
    .array(
      z.object({
        value: z.string().trim().min(1).max(50),
        label: z.string().trim().min(2).max(100),
        context: z.string().trim().min(4).max(220),
      }),
    )
    .min(1)
    .max(5),
  tags: z.array(z.string().trim().min(2).max(60)).min(1).max(8),
  confidence: z.number().min(0).max(1),
});

const agentResultSchema = z.object({
  candidates: z.array(agentCandidateSchema).max(12),
});

export class NewsAgentError extends Error {
  constructor(
    public readonly code:
      | "OPENAI_NOT_CONFIGURED"
      | "OPENAI_UPSTREAM_ERROR"
      | "INVALID_AGENT_RESPONSE"
      | "NO_ALLOWED_SOURCES",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NewsAgentError";
  }
}

export interface RunNewsAgentInput {
  days: number;
  maxCandidates: number;
  sourceIds?: string[];
}

interface RawResponse {
  output?: Array<{
    type?: string;
    action?: {
      sources?: Array<{
        url?: string;
      }>;
    };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        url?: string;
      }>;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          sourceName: { type: "string" },
          sourceUrl: { type: "string", format: "uri" },
          publishedAt: { type: "string" },
          summary: { type: "string" },
          marketImpact: { type: "string" },
          businessImpact: { type: "string" },
          keyMetrics: {
            type: "array",
            minItems: 1,
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                value: { type: "string" },
                label: { type: "string" },
                context: { type: "string" },
              },
              required: ["value", "label", "context"],
            },
          },
          tags: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: { type: "string" },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "title",
          "sourceName",
          "sourceUrl",
          "publishedAt",
          "summary",
          "marketImpact",
          "businessImpact",
          "keyMetrics",
          "tags",
          "confidence",
        ],
      },
    },
  },
  required: ["candidates"],
} as const;

function extractOutputText(response: RawResponse): string | null {
  for (const output of response.output ?? []) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content ?? []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return null;
}

export function extractWebSearchSourceUrls(response: RawResponse): string[] {
  const urls = new Set<string>();

  for (const output of response.output ?? []) {
    for (const source of output.action?.sources ?? []) {
      if (source.url) {
        urls.add(source.url);
      }
    }

    for (const content of output.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          urls.add(annotation.url);
        }
      }
    }
  }

  return [...urls];
}

function articleUrlIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const trackingParameters = new Set([
      "fbclid",
      "gclid",
      "yclid",
      "from",
      "ref",
      "source",
    ]);

    for (const key of [...url.searchParams.keys()]) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith("utm_") ||
        trackingParameters.has(normalizedKey)
      ) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    const query = url.searchParams.toString();
    return `${hostname}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

export function wasSourceConsulted(
  sourceUrl: string,
  consultedUrls: readonly string[],
): boolean {
  const candidateIdentity = articleUrlIdentity(sourceUrl);

  return Boolean(
    candidateIdentity &&
      consultedUrls.some(
        (consultedUrl) => articleUrlIdentity(consultedUrl) === candidateIdentity,
      ),
  );
}

function isUrlFromAllowedDomain(url: string, domains: string[]): boolean {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");

  return domains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

function selectSources(sourceIds?: string[]) {
  const allowedIds = sourceIds?.length ? new Set(sourceIds) : null;
  return getAgentSources().filter(
    (source) => !allowedIds || allowedIds.has(source.id),
  );
}

export function buildNewsAgentRequest(
  input: RunNewsAgentInput,
  sources: NewsSource[],
  now: string,
) {
  const allowedDomains = [
    ...new Set(sources.map((source) => source.searchDomain)),
  ];
  const dateFrom = new Date(now);
  dateFrom.setUTCDate(dateFrom.getUTCDate() - input.days);

  return {
    allowedDomains,
    dateFrom: dateFrom.toISOString(),
    body: {
      model: env.OPENAI_NEWS_MODEL,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "web_search",
          search_context_size: "high",
          external_web_access: true,
          filters: {
            allowed_domains: allowedDomains,
          },
        },
      ],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content:
            "Вы — исследовательский агент редакции SaleTracker. Собирайте только реальные русскоязычные новости о ритейле, FMCG, non-food, поставщиках, закупках, маркетплейсах и логистике. Обязательно выполняйте живой веб-поиск. Не выдумывайте цифры, даты, названия и URL. Каждая карточка должна содержать минимум один проверяемый числовой показатель и естественно сформулированное значение для бизнеса поставщика или закупщика. Не сводите вывод механически к деньгам: объясняйте влияние на спрос, условия контракта, ассортимент, поставки, риски или возможности. Если чисел или достоверной даты публикации в источнике нет, не включайте сюжет. Корпоративное заявление помечайте фактически и не превращайте в независимую оценку. Не публикуйте материалы: результат — только очередь на редакторскую проверку.",
        },
        {
          role: "user",
          content: [
            `Текущее серверное время: ${now}.`,
            `Найдите до ${input.maxCandidates} наиболее значимых материалов, опубликованных не раньше ${dateFrom.toISOString()} и не позже текущего времени.`,
            "Приоритет: выручка, цены, маржа, комиссии, инвестиции, объемы производства и продаж, логистика, доля рынка, изменения требований сетей.",
            "Верните прямой URL конкретной статьи, которую вы действительно открыли в ходе поиска, а не главной страницы или поисковой выдачи.",
            "Пишите summary, marketImpact и businessImpact по-русски, кратко, профессионально и без шаблонной формулы «что это значит для денег».",
            `Используйте только релевантные теги из каталога SaleTracker: ${digestTags.join(", ")}.`,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "saletracker_news_candidates",
          strict: true,
          schema: outputSchema,
        },
      },
    },
  } as const;
}

export async function runNewsAgent(
  input: RunNewsAgentInput,
): Promise<{ run: NewsIngestionRun; candidates: NewsCandidate[] }> {
  if (!env.OPENAI_API_KEY) {
    throw new NewsAgentError(
      "OPENAI_NOT_CONFIGURED",
      "Добавьте OPENAI_API_KEY в .env.local, чтобы запустить сбор реальных новостей.",
      503,
    );
  }

  const sources = selectSources(input.sourceIds);

  if (!sources.length) {
    throw new NewsAgentError(
      "NO_ALLOWED_SOURCES",
      "Не выбрано ни одного разрешённого источника.",
      422,
    );
  }

  const startedAt = new Date().toISOString();
  const request = buildNewsAgentRequest(input, sources, startedAt);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(90_000),
  });

  const responseBody = (await response.json()) as RawResponse;

  if (!response.ok) {
    throw new NewsAgentError(
      "OPENAI_UPSTREAM_ERROR",
      responseBody.error?.message ??
        "OpenAI не смог выполнить исследовательский запрос.",
      502,
    );
  }

  const outputText = extractOutputText(responseBody);
  const consultedUrls = extractWebSearchSourceUrls(responseBody);

  if (!outputText) {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      "AI-агент не вернул структурированный результат.",
      502,
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(outputText);
  } catch {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      "AI-агент вернул некорректный JSON.",
      502,
    );
  }

  const parsed = agentResultSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      "Карточки AI-агента не прошли проверку полей.",
      502,
    );
  }

  const collectedAt = new Date().toISOString();
  const candidates = parsed.data.candidates
    .map((candidate) => ({
      candidate,
      quality: checkCandidateQuality(
        candidate,
        sources,
        request.dateFrom,
        collectedAt,
      ),
    }))
    .filter(
      ({ candidate, quality }) =>
        quality.accepted &&
        isUrlFromAllowedDomain(candidate.sourceUrl, request.allowedDomains) &&
        wasSourceConsulted(candidate.sourceUrl, consultedUrls),
    )
    .slice(0, input.maxCandidates)
    .map<NewsCandidate>(({ candidate, quality }) => ({
      ...candidate,
      sourceName: quality.source?.name ?? candidate.sourceName,
      id: `candidate_${randomUUID()}`,
      collectedAt,
      status: "collected",
      verificationStatus: "structural-pass",
      verificationReasons: quality.reasons,
    }));

  const run: NewsIngestionRun = {
    id: `ingestion_${randomUUID()}`,
    startedAt,
    completedAt: collectedAt,
    model: env.OPENAI_NEWS_MODEL,
    sourceCount: sources.length,
    candidateCount: candidates.length,
  };

  await getNewsCandidateRepository().saveRun(run, candidates);

  return { run, candidates };
}

export function getNewsAgentConfiguration() {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_NEWS_MODEL,
    enabledSourceCount: getAgentSources().length,
    totalSourceCount: newsSourceRegistry.length,
  };
}
