export type NewsAiProvider = "openai" | "perplexity";

export type NewsAiUsageOperation = "feed-analysis" | "web-search";

export type NewsAiCostSource =
  | "calculated"
  | "provider-reported"
  | "unknown";

export interface NewsAiUsage {
  provider: NewsAiProvider;
  model: string;
  providerRequestId?: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsdMicros?: number;
  costSource: NewsAiCostSource;
}

export interface NewsAiUsageEvent extends NewsAiUsage {
  id: string;
  newsArticleId?: string;
  operation: NewsAiUsageOperation;
  createdAt: string;
  updatedAt: string;
}

export interface NewsAiUsageTotals {
  requestCount: number;
  pricedRequestCount: number;
  unpricedRequestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsdMicros: number;
}

export interface NewsAiUsageSummary {
  currency: "USD";
  last24Hours: NewsAiUsageTotals;
  allTime: NewsAiUsageTotals;
  generatedAt: string;
}
