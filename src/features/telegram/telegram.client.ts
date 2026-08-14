import type {
  TelegramBotIdentity,
  TelegramGateway,
  TelegramSendOptions,
  TelegramUpdate,
  TelegramWebhookInfo,
} from "@/features/telegram/telegram.types";

interface TelegramSuccess<T> {
  ok: true;
  result: T;
}

interface TelegramFailure {
  ok: false;
  error_code: number;
  description: string;
  parameters?: {
    retry_after?: number;
  };
}

type TelegramResponse<T> = TelegramSuccess<T> | TelegramFailure;

type Fetch = typeof fetch;
type Wait = (milliseconds: number) => Promise<void>;

const defaultWait: Wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly status: number,
    public readonly description: string,
    public readonly retryAfter?: number,
  ) {
    super(`Telegram Bot API ${method} failed (${status})`);
    this.name = "TelegramApiError";
  }
}

export class TelegramClient implements TelegramGateway {
  constructor(
    private readonly token: string,
    private readonly fetchImplementation: Fetch = fetch,
    private readonly wait: Wait = defaultWait,
  ) {}

  private async call<T>(
    method: string,
    payload: Record<string, unknown> = {},
    requestTimeoutMs = 10_000,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;

      try {
        response = await this.fetchImplementation(
          `https://api.telegram.org/bot${this.token}/${method}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(requestTimeoutMs),
          },
        );
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }

        await this.wait(250 * 2 ** attempt);
        continue;
      }

      const body = (await response.json()) as TelegramResponse<T>;

      if (response.ok && body.ok) {
        return body.result;
      }

      const failure = body as TelegramFailure;
      const error = new TelegramApiError(
        method,
        failure.error_code || response.status,
        failure.description || "Telegram returned an invalid response",
        failure.parameters?.retry_after,
      );
      const retryable = error.status === 429 || error.status >= 500;

      if (!retryable || attempt === 2) {
        throw error;
      }

      await this.wait(
        Math.min(error.retryAfter ? error.retryAfter * 1_000 : 250 * 2 ** attempt, 5_000),
      );
    }

    throw new TelegramApiError(
      method,
      500,
      "Telegram retry budget was exhausted",
    );
  }

  async getMe(): Promise<TelegramBotIdentity> {
    return this.call<TelegramBotIdentity>("getMe");
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message"],
      drop_pending_updates: false,
    });
  }

  async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.call<TelegramWebhookInfo>("getWebhookInfo");
  }

  async setCommands(): Promise<void> {
    await this.call<boolean>("setMyCommands", {
      commands: [
        { command: "start", description: "Подключить дайджест" },
        { command: "digest", description: "Проверить статус выпуска" },
        { command: "settings", description: "Показать мои настройки" },
        { command: "help", description: "Помощь" },
      ],
    });
  }

  async sendMessage(
    chatId: number,
    text: string,
    options: TelegramSendOptions = {},
  ): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode,
      link_preview_options: options.disableLinkPreview
        ? { is_disabled: true }
        : undefined,
    });
  }

  async getUpdates(
    offset?: number,
    timeoutSeconds = 0,
  ): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout: timeoutSeconds,
        allowed_updates: ["message"],
      },
      Math.max(10_000, (timeoutSeconds + 5) * 1_000),
    );
  }
}
