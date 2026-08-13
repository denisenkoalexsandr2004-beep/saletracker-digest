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
  ) {}

  private async call<T>(
    method: string,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await this.fetchImplementation(
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await response.json()) as TelegramResponse<T>;

    if (!response.ok || !body.ok) {
      const failure = body as TelegramFailure;
      throw new TelegramApiError(
        method,
        failure.error_code || response.status,
        failure.description || "Telegram returned an invalid response",
        failure.parameters?.retry_after,
      );
    }

    return body.result;
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

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: 0,
      allowed_updates: ["message"],
    });
  }
}
