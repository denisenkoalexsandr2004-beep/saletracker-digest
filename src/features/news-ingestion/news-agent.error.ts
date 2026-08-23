export type NewsAgentErrorCode =
  | "OPENAI_NOT_CONFIGURED"
  | "OPENAI_UPSTREAM_ERROR"
  | "OPENAI_TIMEOUT"
  | "NEWS_PROVIDER_NOT_CONFIGURED"
  | "NEWS_PROVIDER_UPSTREAM_ERROR"
  | "NEWS_PROVIDER_TIMEOUT"
  | "NEWS_INGESTION_BATCH_FAILED"
  | "INVALID_AGENT_RESPONSE"
  | "NO_ALLOWED_SOURCES";

export class NewsAgentError extends Error {
  constructor(
    public readonly code: NewsAgentErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NewsAgentError";
  }
}
