import type { MaterialMetric } from "@/features/digests/digest.types";
import type { NewsSource } from "@/features/news-sources/news-source.types";
import { digestTags } from "@/features/subscriptions/subscription.categories";

interface CandidateForQualityCheck {
  sourceUrl: string;
  publishedAt: string;
  tags: string[];
  keyMetrics: MaterialMetric[];
}

export interface CandidateQualityResult {
  accepted: boolean;
  reasons: string[];
  source?: NewsSource;
}

const allowedTags = new Set<string>(digestTags);
const nonArticlePaths = new Set([
  "/",
  "/search",
  "/search/",
  "/news",
  "/news/",
  "/articles",
  "/articles/",
]);

function sourceForUrl(url: URL, sources: NewsSource[]): NewsSource | undefined {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return sources.find((source) => {
    const domain = source.searchDomain.toLowerCase().replace(/^www\./, "");
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });
}

export function checkCandidateQuality(
  candidate: CandidateForQualityCheck,
  sources: NewsSource[],
  earliestPublishedAt: string,
  now: string,
): CandidateQualityResult {
  const reasons: string[] = [];
  let url: URL | undefined;

  try {
    url = new URL(candidate.sourceUrl);
  } catch {
    reasons.push("invalid-source-url");
  }

  const source = url ? sourceForUrl(url, sources) : undefined;

  if (!source) {
    reasons.push("source-outside-registry");
  }

  if (
    url &&
    (nonArticlePaths.has(url.pathname.toLowerCase()) ||
      url.searchParams.has("q") ||
      url.searchParams.has("query") ||
      url.searchParams.has("search"))
  ) {
    reasons.push("not-a-direct-article-url");
  }

  const publishedAt = Date.parse(candidate.publishedAt);
  const earliest = Date.parse(earliestPublishedAt);
  const latest = Date.parse(now) + 5 * 60 * 1_000;

  if (
    !Number.isFinite(publishedAt) ||
    publishedAt < earliest ||
    publishedAt > latest
  ) {
    reasons.push("published-at-outside-window");
  }

  if (candidate.tags.some((tag) => !allowedTags.has(tag))) {
    reasons.push("unknown-tag");
  }

  if (
    !candidate.keyMetrics.length ||
    candidate.keyMetrics.some((metric) => !/\d/u.test(metric.value))
  ) {
    reasons.push("metric-without-number");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    source,
  };
}
