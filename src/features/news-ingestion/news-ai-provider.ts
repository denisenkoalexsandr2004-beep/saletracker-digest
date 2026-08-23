import { NewsAgentError } from "@/features/news-ingestion/news-agent.error";
import { getNewsAiUsageRepository } from "@/features/news-ingestion/news-ai-usage.repository";
import type {
  NewsAiProvider,
  NewsAiUsage,
  NewsAiUsageOperation,
} from "@/features/news-ingestion/news-ai-usage.types";
import { env } from "@/shared/config/env";

export type { NewsAiProvider } from "@/features/news-ingestion/news-ai-usage.types";

export interface NewsAiProviderConfiguration {
  provider: NewsAiProvider;
  providerLabel: "OpenAI" | "Perplexity";
  configured: boolean;
  credentialName: "OPENAI_API_KEY" | "PERPLEXITY_API_KEY";
  model: string;
}

export interface StructuredNewsAnalysisRequest {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
}

export interface NewsAiUsageContext {
  operation: NewsAiUsageOperation;
  newsArticleId?: string;
}

interface NewsAiHttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function getProviderApiKey(provider: NewsAiProvider): string | undefined {
  return provider === "perplexity"
    ? env.PERPLEXITY_API_KEY
    : env.OPENAI_API_KEY;
}

export function getNewsAiProviderConfiguration(): NewsAiProviderConfiguration {
  const provider = env.NEWS_AI_PROVIDER;
  const isPerplexity = provider === "perplexity";

  return {
    provider,
    providerLabel: isPerplexity ? "Perplexity" : "OpenAI",
    configured: Boolean(getProviderApiKey(provider)),
    credentialName: isPerplexity
      ? "PERPLEXITY_API_KEY"
      : "OPENAI_API_KEY",
    model: isPerplexity
      ? env.PERPLEXITY_NEWS_MODEL
      : env.OPENAI_NEWS_MODEL,
  };
}

/**
 * Pure request builder kept separate from transport so both provider contracts
 * can be regression-tested without making paid network calls.
 */
export function buildNewsAiHttpRequest(
  request: StructuredNewsAnalysisRequest,
  configuration: Pick<
    NewsAiProviderConfiguration,
    "provider" | "model"
  >,
  apiKey: string,
): NewsAiHttpRequest {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  if (configuration.provider === "perplexity") {
    return {
      url: "https://api.perplexity.ai/v1/sonar",
      headers,
      body: {
        model: configuration.model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { schema: request.schema },
        },
      },
    };
  }

  return {
    url: "https://api.openai.com/v1/responses",
    headers,
    body: {
      model: configuration.model,
      store: false,
      service_tier: "default",
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: request.schema,
        },
      },
    },
  };
}

interface OpenAiTokenRates {
  input: number;
  cachedInput: number;
  output: number;
}

const openAiTokenRates: Record<string, OpenAiTokenRates> = {
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
  "gpt-5.6": { input: 5, cachedInput: 0.5, output: 30 },
};

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function getOpenAiTokenRates(model: string): OpenAiTokenRates | undefined {
  if (openAiTokenRates[model]) {
    return openAiTokenRates[model];
  }

  return ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]
    .filter((modelName) => model.startsWith(`${modelName}-`))
    .map((modelName) => openAiTokenRates[modelName])[0];
}

export function countOpenAiWebSearchCalls(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 0;
  }

  const output = (payload as { output?: Array<{ type?: unknown }> }).output;
  return (output ?? []).filter((item) => item.type === "web_search_call").length;
}

/**
 * Returns micro-dollars. GPT-5.6 rates are dollars per million tokens, so
 * multiplying tokens by the published rate directly yields micro-dollars.
 */
export function calculateOpenAiCostUsdMicros(input: {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}): number | undefined {
  const rates = getOpenAiTokenRates(input.model);

  if (!rates) {
    return undefined;
  }

  const uncachedInputTokens = Math.max(
    0,
    input.inputTokens - input.cachedInputTokens - input.cacheWriteTokens,
  );
  const longContext = input.inputTokens > 272_000;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;

  return Math.round(
    uncachedInputTokens * rates.input * inputMultiplier +
      input.cachedInputTokens * rates.cachedInput * inputMultiplier +
      input.cacheWriteTokens * rates.input * 1.25 * inputMultiplier +
      input.outputTokens * rates.output * outputMultiplier,
  );
}

export function extractNewsAiUsage(
  payload: unknown,
  configuration: Pick<NewsAiProviderConfiguration, "provider" | "model">,
): NewsAiUsage {
  const record = payload && typeof payload === "object" ? payload : {};
  const responseModel = (record as { model?: unknown }).model;
  const model =
    typeof responseModel === "string" && responseModel
      ? responseModel
      : configuration.model;
  const responseId = (record as { id?: unknown }).id;
  const providerRequestId =
    typeof responseId === "string" && responseId ? responseId : undefined;
  const usageValue = (record as { usage?: unknown }).usage;
  const usage =
    usageValue && typeof usageValue === "object"
      ? (usageValue as Record<string, unknown>)
      : null;

  if (configuration.provider === "perplexity") {
    const inputTokens = readNonNegativeInteger(usage?.prompt_tokens);
    const outputTokens = readNonNegativeInteger(usage?.completion_tokens);
    const reasoningTokens = readNonNegativeInteger(usage?.reasoning_tokens);
    const totalTokens = readNonNegativeInteger(usage?.total_tokens);
    const costValue = usage?.cost;
    const cost =
      costValue && typeof costValue === "object"
        ? readNonNegativeNumber(
            (costValue as Record<string, unknown>).total_cost,
          )
        : undefined;

    return {
      provider: "perplexity",
      model,
      providerRequestId,
      inputTokens,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens,
      reasoningTokens,
      totalTokens: totalTokens || inputTokens + outputTokens,
      costUsdMicros:
        cost === undefined ? undefined : Math.round(cost * 1_000_000),
      costSource: cost === undefined ? "unknown" : "provider-reported",
    };
  }

  const inputDetailsValue = usage?.input_tokens_details;
  const inputDetails =
    inputDetailsValue && typeof inputDetailsValue === "object"
      ? (inputDetailsValue as Record<string, unknown>)
      : {};
  const outputDetailsValue = usage?.output_tokens_details;
  const outputDetails =
    outputDetailsValue && typeof outputDetailsValue === "object"
      ? (outputDetailsValue as Record<string, unknown>)
      : {};
  const inputTokens = readNonNegativeInteger(usage?.input_tokens);
  const cachedInputTokens = readNonNegativeInteger(inputDetails.cached_tokens);
  const cacheWriteTokens = readNonNegativeInteger(
    inputDetails.cache_write_tokens,
  );
  const outputTokens = readNonNegativeInteger(usage?.output_tokens);
  const reasoningTokens = readNonNegativeInteger(
    outputDetails.reasoning_tokens,
  );
  const totalTokens = readNonNegativeInteger(usage?.total_tokens);
  const costUsdMicros = usage
    ? calculateOpenAiCostUsdMicros({
        model,
        inputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        outputTokens,
      })
    : undefined;

  return {
    provider: "openai",
    model,
    providerRequestId,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
    costUsdMicros,
    costSource: costUsdMicros === undefined ? "unknown" : "calculated",
  };
}

/** Metering must never turn an already-paid successful response into a retry. */
export async function recordNewsAiUsage(
  payload: unknown,
  configuration: Pick<NewsAiProviderConfiguration, "provider" | "model">,
  context: NewsAiUsageContext,
): Promise<void> {
  const extractedUsage = extractNewsAiUsage(payload, configuration);
  const webSearchCostUsdMicros =
    context.operation === "web-search" &&
    extractedUsage.provider === "openai"
      ? countOpenAiWebSearchCalls(payload) * 10_000
      : 0;
  const usage = {
    ...extractedUsage,
    costUsdMicros:
      extractedUsage.costUsdMicros === undefined
        ? undefined
        : extractedUsage.costUsdMicros + webSearchCostUsdMicros,
  };

  try {
    await getNewsAiUsageRepository().record({
      ...usage,
      ...context,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[news-ai-usage] failed to persist provider usage", error);
  }
}

function getErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = (payload as { error?: unknown }).error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}

function extractOpenAiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const directText = (payload as { output_text?: unknown }).output_text;

  if (typeof directText === "string" && directText) {
    return directText;
  }

  const output = (payload as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  }).output;

  for (const item of output ?? []) {
    if (item.type !== "message") {
      continue;
    }

    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return null;
}

function extractPerplexityText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const choices = (payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" && content ? content : null;
}

export async function requestStructuredNewsAnalysis(
  request: StructuredNewsAnalysisRequest,
  timeoutMs: number,
  usageContext: NewsAiUsageContext,
): Promise<string> {
  const configuration = getNewsAiProviderConfiguration();
  const apiKey = getProviderApiKey(configuration.provider);

  if (!apiKey) {
    throw new NewsAgentError(
      "NEWS_PROVIDER_NOT_CONFIGURED",
      `Для провайдера ${configuration.providerLabel} нужен ${configuration.credentialName}.`,
      503,
    );
  }

  const httpRequest = buildNewsAiHttpRequest(
    request,
    configuration,
    apiKey,
  );
  let response: Response;

  try {
    response = await fetch(httpRequest.url, {
      method: "POST",
      headers: httpRequest.headers,
      body: JSON.stringify(httpRequest.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new NewsAgentError(
      timedOut ? "NEWS_PROVIDER_TIMEOUT" : "NEWS_PROVIDER_UPSTREAM_ERROR",
      timedOut
        ? `${configuration.providerLabel} не разобрал публикацию за ${Math.round(timeoutMs / 1_000)} с.`
        : `Не удалось связаться с ${configuration.providerLabel}: ${error instanceof Error ? error.message : "сетевая ошибка"}.`,
      timedOut ? 504 : 502,
    );
  }

  const rawPayload = await response.text();
  let payload: unknown = null;

  try {
    payload = rawPayload ? JSON.parse(rawPayload) : null;
  } catch {
    // The typed error below deliberately hides an upstream HTML/proxy body.
  }

  if (!response.ok) {
    throw new NewsAgentError(
      "NEWS_PROVIDER_UPSTREAM_ERROR",
      getErrorMessage(payload) ??
        `${configuration.providerLabel} вернул HTTP ${response.status}.`,
      502,
    );
  }

  await recordNewsAiUsage(payload, configuration, usageContext);

  const outputText =
    configuration.provider === "perplexity"
      ? extractPerplexityText(payload)
      : extractOpenAiText(payload);

  if (!outputText) {
    throw new NewsAgentError(
      "INVALID_AGENT_RESPONSE",
      `${configuration.providerLabel} не вернул структурированный результат.`,
      502,
    );
  }

  return outputText;
}
