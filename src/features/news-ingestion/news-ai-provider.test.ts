import { describe, expect, it } from "vitest";

import {
  buildNewsAiHttpRequest,
  calculateOpenAiCostUsdMicros,
  countOpenAiWebSearchCalls,
  extractNewsAiUsage,
} from "@/features/news-ingestion/news-ai-provider";

const analysisRequest = {
  schemaName: "saletracker_test_card",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { cards: { type: "array", items: { type: "string" } } },
    required: ["cards"],
  },
  systemPrompt: "Отфильтруйте публикацию.",
  userPrompt: "Верните карточку.",
};

describe("news AI provider contracts", () => {
  it("строит OpenAI Responses request со строгой JSON Schema", () => {
    const request = buildNewsAiHttpRequest(
      analysisRequest,
      { provider: "openai", model: "gpt-test" },
      "openai-test-key",
    );

    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.headers.Authorization).toBe("Bearer openai-test-key");
    expect(request.body).toMatchObject({
      model: "gpt-test",
      store: false,
      service_tier: "default",
      input: [
        { role: "system", content: analysisRequest.systemPrompt },
        { role: "user", content: analysisRequest.userPrompt },
      ],
      text: {
        format: {
          type: "json_schema",
          name: analysisRequest.schemaName,
          strict: true,
          schema: analysisRequest.schema,
        },
      },
    });
  });

  it("строит Perplexity Sonar request со структурированным ответом", () => {
    const request = buildNewsAiHttpRequest(
      analysisRequest,
      { provider: "perplexity", model: "sonar" },
      "perplexity-test-key",
    );

    expect(request.url).toBe("https://api.perplexity.ai/v1/sonar");
    expect(request.headers.Authorization).toBe("Bearer perplexity-test-key");
    expect(request.body).toEqual({
      model: "sonar",
      messages: [
        { role: "system", content: analysisRequest.systemPrompt },
        { role: "user", content: analysisRequest.userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { schema: analysisRequest.schema },
      },
    });
  });

  it("считает Luna по uncached, cached, cache-write и output токенам", () => {
    expect(
      calculateOpenAiCostUsdMicros({
        model: "gpt-5.6-luna",
        inputTokens: 10_000,
        cachedInputTokens: 2_000,
        cacheWriteTokens: 1_000,
        outputTokens: 1_000,
      }),
    ).toBe(2_890);
  });

  it("извлекает фактический Responses usage вместе с reasoning", () => {
    expect(
      extractNewsAiUsage(
        {
          id: "resp_test_123",
          model: "gpt-5.6-luna",
          usage: {
            input_tokens: 10_000,
            input_tokens_details: {
              cached_tokens: 2_000,
              cache_write_tokens: 1_000,
            },
            output_tokens: 1_000,
            output_tokens_details: { reasoning_tokens: 300 },
            total_tokens: 11_000,
          },
        },
        { provider: "openai", model: "gpt-5.6-luna" },
      ),
    ).toEqual({
      provider: "openai",
      model: "gpt-5.6-luna",
      providerRequestId: "resp_test_123",
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      cacheWriteTokens: 1_000,
      outputTokens: 1_000,
      reasoningTokens: 300,
      totalTokens: 11_000,
      costUsdMicros: 2_890,
      costSource: "calculated",
    });
  });

  it("использует стоимость, которую вернул Perplexity", () => {
    expect(
      extractNewsAiUsage(
        {
          id: "pplx_test_123",
          model: "sonar",
          usage: {
            prompt_tokens: 120,
            completion_tokens: 80,
            total_tokens: 200,
            cost: { total_cost: 0.00542 },
          },
        },
        { provider: "perplexity", model: "sonar" },
      ),
    ).toMatchObject({
      provider: "perplexity",
      model: "sonar",
      providerRequestId: "pplx_test_123",
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      costUsdMicros: 5_420,
      costSource: "provider-reported",
    });
  });

  it("считает отдельные платные вызовы OpenAI web search", () => {
    expect(
      countOpenAiWebSearchCalls({
        output: [
          { type: "web_search_call" },
          { type: "message" },
          { type: "web_search_call" },
        ],
      }),
    ).toBe(2);
  });
});
