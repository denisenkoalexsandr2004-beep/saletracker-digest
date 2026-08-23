"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  DigestDeliveryStatus,
  DigestDeliveryView,
} from "@/features/deliveries/digest-delivery.types";
import type {
  CzsEvent,
  Material,
  MaterialStatus,
} from "@/features/digests/digest.types";
import type { NewsCandidate } from "@/features/news-ingestion/news-candidate.types";
import type { NewsAiUsageSummary } from "@/features/news-ingestion/news-ai-usage.types";
import type { NewsSource } from "@/features/news-sources/news-source.types";
import {
  frequencyLabels,
  roleLabels,
} from "@/features/subscriptions/subscription.types";

interface AdminConsoleProps {
  initialAiUsage: NewsAiUsageSummary;
  initialMaterials: Material[];
  initialDeliveries: DigestDeliveryView[];
  initialCandidates: NewsCandidate[];
  sources: NewsSource[];
  agentConfiguration: {
    provider: "openai" | "perplexity";
    providerLabel: "OpenAI" | "Perplexity";
    configured: boolean;
    credentialName: "OPENAI_API_KEY" | "PERPLEXITY_API_KEY";
    model: string;
    enabledSourceCount: number;
    totalSourceCount: number;
    groupCount: number;
  };
  events: CzsEvent[];
}

type QueueFilter = "all" | "review" | "approved";
type AdminWorkspace = "subscribers" | "materials" | "sources";

const statusLabels: Record<MaterialStatus, string> = {
  collected: "Собран",
  draft: "Черновик",
  review: "На проверке",
  approved: "Утверждён",
};

const deliveryStatusLabels: Record<DigestDeliveryStatus, string> = {
  "waiting-telegram": "Ждём Telegram",
  ready: "Готов к отправке",
  sending: "Отправляется",
  sent: "Отправлен",
  failed: "Нужна повторная отправка",
};

interface DeliveryQueueResponse {
  data?: DigestDeliveryView[];
  detail?: string;
}

interface DeliveryDispatchResponse {
  data?: DigestDeliveryView;
  detail?: string;
  meta?: {
    alreadySent?: boolean;
  };
}

interface TelegramSynchronizationResponse {
  data?: {
    mode: "polling" | "webhook";
    received: number;
    processed: number;
  };
  detail?: string;
}

interface IngestionResponse {
  data?: {
    candidates: NewsCandidate[];
    diagnostics?: {
      accepted: number;
      entriesFound?: number;
      entriesQueued?: number;
      entriesReviewed?: number;
      failed?: number;
      retried?: number;
      deadLettered?: number;
      queue?: {
        pending: number;
        retry: number;
        deadLetter: number;
      };
      rejected: Array<{ sourceUrl: string; reasons: string[] }>;
    };
  };
  detail?: string;
  message?: string;
}

interface AiUsageResponse {
  data?: NewsAiUsageSummary;
}

interface MaterialMutationResponse {
  data?: Material;
  detail?: string;
}

function formatAdminTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(value));
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatUsdMicros(value: number): string {
  const dollars = value / 1_000_000;
  const maximumFractionDigits = dollars < 0.01 ? 5 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(dollars);
}

export function AdminConsole({
  initialAiUsage,
  initialMaterials,
  initialDeliveries,
  initialCandidates,
  sources,
  agentConfiguration,
  events,
}: AdminConsoleProps) {
  const [aiUsage, setAiUsage] = useState(initialAiUsage);
  const [materials, setMaterials] = useState(initialMaterials);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [workspace, setWorkspace] =
    useState<AdminWorkspace>("subscribers");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState<{
    group: number;
    total: number;
  } | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialTag, setMaterialTag] = useState("");
  const [materialSource, setMaterialSource] = useState("");
  const [editingDeliveryId, setEditingDeliveryId] = useState<string | null>(
    null,
  );
  const [draftItemIds, setDraftItemIds] = useState<string[]>([]);
  const [isSavingComposition, setIsSavingComposition] = useState(false);
  const [queueNotice, setQueueNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const materialTagOptions = useMemo(
    () =>
      [...new Set(materials.flatMap((material) => material.tags))].sort(
        (left, right) => left.localeCompare(right, "ru"),
      ),
    [materials],
  );

  const materialSourceOptions = useMemo(
    () =>
      [...new Set(materials.flatMap((material) => material.sourceNames))].sort(
        (left, right) => left.localeCompare(right, "ru"),
      ),
    [materials],
  );

  const visibleMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();

    return materials.filter((material) => {
      if (filter !== "all" && material.status !== filter) {
        return false;
      }

      if (materialTag && !material.tags.includes(materialTag)) {
        return false;
      }

      if (materialSource && !material.sourceNames.includes(materialSource)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        material.title.toLowerCase().includes(query) ||
        material.summary.toLowerCase().includes(query)
      );
    });
  }, [filter, materialSearch, materialSource, materialTag, materials]);

  const approvedMaterials = useMemo(
    () => materials.filter((material) => material.status === "approved"),
    [materials],
  );

  const isMaterialFilterActive = Boolean(
    materialSearch.trim() || materialTag || materialSource,
  );

  const approvedCount = materials.filter(
    (material) => material.status === "approved",
  ).length;
  const reviewCount = materials.filter(
    (material) => material.status === "review",
  ).length;
  const readyDeliveryCount = deliveries.filter(
    (delivery) => delivery.status === "ready" || delivery.status === "failed",
  ).length;
  const matchingEvent = events.find((event) =>
    event.tags.includes("Молочная продукция"),
  );

  async function setStatus(id: string, status: MaterialStatus) {
    const response = await fetch(
      `/api/admin/materials/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    const body = (await response.json()) as MaterialMutationResponse;

    if (!response.ok || !body.data) {
      setQueueNotice({
        type: "error",
        text: body.detail ?? "Не удалось изменить статус материала.",
      });
      return;
    }

    setMaterials((current) =>
      current.map((material) =>
        material.id === id ? body.data! : material,
      ),
    );
  }

  async function promoteCandidate(candidateId: string) {
    setPromotingId(candidateId);
    setQueueNotice(null);

    try {
      const response = await fetch(
        `/api/admin/news-candidates/${encodeURIComponent(candidateId)}/promotions`,
        { method: "POST" },
      );
      const body = (await response.json()) as MaterialMutationResponse;

      if (!response.ok || !body.data) {
        throw new Error(body.detail ?? "Не удалось передать материал редактору.");
      }

      setMaterials((current) =>
        current.some((material) => material.id === body.data!.id)
          ? current
          : [body.data!, ...current],
      );
      setCandidates((current) =>
        current.map((candidate) =>
          candidate.id === candidateId
            ? { ...candidate, status: "review" }
            : candidate,
        ),
      );
      setQueueNotice({
        type: "success",
        text: "Кандидат добавлен в редакционную очередь.",
      });
    } catch (error) {
      setQueueNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось передать материал редактору.",
      });
    } finally {
      setPromotingId(null);
    }
  }

  async function refreshDeliveries() {
    setIsRefreshing(true);
    setQueueNotice(null);

    try {
      const synchronizationResponse = await fetch(
        "/api/admin/telegram-synchronizations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      const synchronizationBody =
        (await synchronizationResponse.json()) as TelegramSynchronizationResponse;
      const response = await fetch("/api/admin/digest-deliveries", {
        cache: "no-store",
      });
      const body = (await response.json()) as DeliveryQueueResponse;

      if (!response.ok || !body.data) {
        throw new Error(body.detail ?? "Не удалось обновить очередь.");
      }

      setDeliveries(body.data);
      if (!synchronizationResponse.ok) {
        setQueueNotice({
          type: "error",
          text:
            synchronizationBody.detail ??
            "Очередь обновлена, но Telegram проверить не удалось.",
        });
      } else if ((synchronizationBody.data?.processed ?? 0) > 0) {
        setQueueNotice({
          type: "success",
          text: `Новых подключений Telegram: ${synchronizationBody.data?.processed}. Очередь обновлена.`,
        });
      }
    } catch (error) {
      setQueueNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось обновить очередь.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function sendDelivery(deliveryId: string) {
    setSendingId(deliveryId);
    setQueueNotice(null);

    try {
      const response = await fetch(
        `/api/admin/digest-deliveries/${encodeURIComponent(deliveryId)}/dispatches`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      const body = (await response.json()) as DeliveryDispatchResponse;

      if (!response.ok || !body.data) {
        throw new Error(body.detail ?? "Не удалось отправить выпуск.");
      }

      setDeliveries((current) =>
        current.map((delivery) =>
          delivery.id === body.data?.id ? body.data : delivery,
        ),
      );
      setQueueNotice({
        type: "success",
        text: body.meta?.alreadySent
          ? "Этот выпуск уже был отправлен — повторного сообщения не создано."
          : `Выпуск для «${body.data.subscriber.company}» отправлен в Telegram.`,
      });
    } catch (error) {
      setQueueNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось отправить выпуск.",
      });
      await refreshDeliveries();
    } finally {
      setSendingId(null);
    }
  }

  function startComposition(delivery: DigestDeliveryView) {
    setEditingDeliveryId(delivery.id);
    setDraftItemIds(delivery.issue.items.map((item) => item.id));
    setQueueNotice(null);
  }

  function toggleDraftItem(materialId: string) {
    setDraftItemIds((current) =>
      current.includes(materialId)
        ? current.filter((id) => id !== materialId)
        : [...current, materialId],
    );
  }

  async function saveComposition(deliveryId: string) {
    setIsSavingComposition(true);
    setQueueNotice(null);

    try {
      const response = await fetch(
        `/api/admin/digest-deliveries/${encodeURIComponent(deliveryId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: draftItemIds }),
        },
      );
      const body = (await response.json()) as DeliveryDispatchResponse;

      if (!response.ok || !body.data) {
        throw new Error(body.detail ?? "Не удалось сохранить состав выпуска.");
      }

      setDeliveries((current) =>
        current.map((delivery) =>
          delivery.id === body.data?.id ? body.data : delivery,
        ),
      );
      setEditingDeliveryId(null);
      setQueueNotice({
        type: "success",
        text: `Состав выпуска обновлён: ${body.data.issue.itemCount} новостей.`,
      });
    } catch (error) {
      setQueueNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось сохранить состав выпуска.",
      });
    } finally {
      setIsSavingComposition(false);
    }
  }

  async function collectNews() {
    setIsCollecting(true);
    setQueueNotice(null);

    // Первый вызов сохраняет свежие ссылки, следующие только выгребают очередь.
    // Ошибка одной статьи не откатывает и не повторяет соседние.
    const batches = 3;
    const collected: NewsCandidate[] = [];
    const failures: string[] = [];
    const rejectionReasons = new Set<string>();
    let entriesFound = 0;
    let entriesQueued = 0;
    let entriesReviewed = 0;
    let processingFailures = 0;
    let queuePending = 0;
    let queueRetries = 0;
    let queueDeadLetter = 0;

    try {
      for (let batch = 0; batch < batches; batch += 1) {
        setCollectProgress({ group: batch + 1, total: batches });

        try {
          const response = await fetch("/api/admin/ingestion-runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "feeds",
              days: 5,
              maxCandidates: 12,
              discover: batch === 0,
            }),
          });
          const body = (await response.json()) as IngestionResponse;

          if (!response.ok || !body.data) {
            throw new Error(body.detail ?? "Не удалось разобрать публикации.");
          }

          collected.push(...body.data.candidates);
          entriesFound = Math.max(
            entriesFound,
            body.data.diagnostics?.entriesFound ?? 0,
          );
          entriesQueued += body.data.diagnostics?.entriesQueued ?? 0;
          entriesReviewed += body.data.diagnostics?.entriesReviewed ?? 0;
          processingFailures += body.data.diagnostics?.failed ?? 0;
          queuePending = body.data.diagnostics?.queue?.pending ?? queuePending;
          queueRetries = body.data.diagnostics?.queue?.retry ?? queueRetries;
          queueDeadLetter =
            body.data.diagnostics?.queue?.deadLetter ?? queueDeadLetter;
          for (const item of body.data.diagnostics?.rejected ?? []) {
            for (const reason of item.reasons) {
              rejectionReasons.add(reason);
            }
          }

          // Порция пустая — готовых к обработке задач сейчас не осталось.
          if (!body.data.diagnostics?.entriesReviewed) {
            break;
          }
        } catch (error) {
          // Внутри порции статьи уже изолированы друг от друга. Ошибка всего
          // HTTP-вызова означает системный сбой, поэтому провайдера не долбим
          // ещё двумя заведомо неуспешными пачками.
          failures.push(
            error instanceof Error ? error.message : "неизвестная ошибка",
          );
          break;
        }
      }

      if (collected.length) {
        setCandidates((current) => {
          const knownUrls = new Set(current.map((item) => item.sourceUrl));
          const fresh = collected.filter(
            (item) => !knownUrls.has(item.sourceUrl),
          );
          return [...fresh, ...current];
        });
      }

      const failureNote = failures.length
        ? ` Порций с ошибкой: ${failures.length} (${failures[0]}).`
        : "";
      const retryNote = processingFailures
        ? ` Ошибок отдельных статей: ${processingFailures}; ожидают повтора: ${queueRetries}.`
        : "";
      const deadLetterNote = queueDeadLetter
        ? ` Требуют разбора вручную: ${queueDeadLetter}.`
        : "";

      setQueueNotice({
        type:
          !failures.length && !processingFailures && !queueDeadLetter
            ? "success"
            : "error",
        text: collected.length
          ? `Публикаций в лентах: ${entriesFound}, новых в очереди: ${entriesQueued}, обработано: ${entriesReviewed}. Собрано кандидатов: ${collected.length}. Осталось: ${queuePending}.${retryNote}${deadLetterNote}${failureNote}`
          : `Новых в очереди: ${entriesQueued}, обработано: ${entriesReviewed}, кандидатов нет.${rejectionReasons.size ? ` Причины: ${[...rejectionReasons].join(", ")}.` : ""}${retryNote}${deadLetterNote}${failureNote}`,
      });
    } finally {
      try {
        const response = await fetch("/api/admin/ai-usage", {
          cache: "no-store",
        });
        const body = (await response.json()) as AiUsageResponse;

        if (response.ok && body.data) {
          setAiUsage(body.data);
        }
      } catch {
        // Сбор уже завершён; недоступность счётчика не отменяет его результат.
      }

      setCollectProgress(null);
      setIsCollecting(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/sessions", { method: "DELETE" });
    window.location.assign("/admin/login");
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link className="brand" href="/" aria-label="Сейл Трекер — главная">
          <Image
            alt="Сейл Трекер"
            height={40}
            priority
            src="/brand/saletracker-logo.svg"
            width={194}
          />
          <span className="brand-product">Редакция</span>
        </Link>
        <div className="admin-user">
          <i aria-hidden="true" />
          <span>Защищённая сессия редактора</span>
          <button onClick={signOut} type="button">
            Выйти
          </button>
        </div>
      </header>

      <main className="admin-main" id="main-content">
        <div className="admin-title-row">
          <div>
            <p className="section-kicker">Редакторский контур</p>
            <h1>Пульт выпусков</h1>
            <p>До закрытия набора на ближайший выпуск · 47 минут</p>
          </div>
          <Link className="button button-signal" href="/preview">
            Проверить Telegram-выпуск ↗
          </Link>
        </div>

        <section className="admin-kpis" aria-label="Сводные показатели">
          <article className="admin-kpi">
            <span>В редакционной базе</span>
            <strong>{materials.length}</strong>
          </article>
          <article className="admin-kpi">
            <span>Готовы к выпуску</span>
            <strong>{approvedCount}</strong>
          </article>
          <article className="admin-kpi">
            <span>Ждут решения</span>
            <strong>{reviewCount}</strong>
          </article>
          <article className="admin-kpi">
            <span>Выпуски к отправке</span>
            <strong>{readyDeliveryCount}</strong>
          </article>
        </section>

        <nav className="admin-workspace-tabs" aria-label="Разделы админки">
          {(
            [
              ["subscribers", `Пользователи · ${deliveries.length}`],
              ["materials", `Материалы · ${materials.length}`],
              ["sources", `Источники и AI · ${sources.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              aria-current={workspace === id ? "page" : undefined}
              key={id}
              onClick={() => setWorkspace(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {queueNotice ? (
          <p
            aria-live="polite"
            className={`queue-notice admin-global-notice queue-notice--${queueNotice.type}`}
          >
            {queueNotice.text}
          </p>
        ) : null}

        {workspace === "subscribers" ? (
          <section className="admin-panel delivery-panel subscriber-workbench">
            <div className="admin-panel-head delivery-panel-head">
              <div>
                <p className="mono-label">Пользователь → выпуск → статьи → отправка</p>
                <h2>Персональные карточки подписчиков</h2>
                <p className="delivery-panel-lead">
                  Для каждого пользователя видны настройки, статус Telegram,
                  точный состав выпуска и прямые ссылки на все статьи.
                </p>
              </div>
              <button
                className="queue-refresh"
                disabled={isRefreshing}
                onClick={refreshDeliveries}
                type="button"
              >
                {isRefreshing ? "Проверяем…" : "Проверить Telegram и очередь"}
              </button>
            </div>

            <div className="subscriber-list">
              {deliveries.length === 0 ? (
                <div className="delivery-empty">
                  <span>Подписчиков пока нет</span>
                  <p>
                    Создайте подписку на главной странице и завершите
                    подключение кнопкой Start в Telegram.
                  </p>
                  <Link className="button button-dark" href="/#setup">
                    Открыть форму подписки
                  </Link>
                </div>
              ) : (
                deliveries.map((delivery) => {
                  const canSend =
                    delivery.status === "ready" ||
                    delivery.status === "failed";
                  const isSending =
                    delivery.status === "sending" ||
                    sendingId === delivery.id;
                  const telegramDone =
                    delivery.subscriber.telegramConnected ||
                    delivery.status !== "waiting-telegram";
                  const dispatchDone = delivery.status === "sent";
                  const isEditingComposition =
                    editingDeliveryId === delivery.id;
                  const canEditComposition = !dispatchDone && !isSending;

                  return (
                    <article className="subscriber-card" key={delivery.id}>
                      <header className="subscriber-card-head">
                        <div className="delivery-identity">
                          <span
                            className={`delivery-status delivery-status--${delivery.status}`}
                          >
                            {deliveryStatusLabels[delivery.status]}
                          </span>
                          <h3>{delivery.subscriber.company}</h3>
                          <p>
                            {delivery.subscriber.name} ·{" "}
                            {roleLabels[delivery.subscriber.role]}
                          </p>
                          <span className="subscriber-telegram">
                            {delivery.subscriber.telegramUsername
                              ? `@${delivery.subscriber.telegramUsername}`
                              : "Telegram ещё не подключён"}
                          </span>
                        </div>

                        <div
                          aria-label="Статус маршрута выпуска"
                          className="delivery-rail"
                        >
                          <div className="delivery-stage is-complete">
                            <i aria-hidden="true" />
                            <span>Подписка</span>
                          </div>
                          <div
                            className={`delivery-stage ${telegramDone ? "is-complete" : "is-pending"}`}
                          >
                            <i aria-hidden="true" />
                            <span>Telegram</span>
                          </div>
                          <div
                            className={`delivery-stage ${
                              dispatchDone
                                ? "is-complete"
                                : isSending
                                  ? "is-active"
                                  : "is-pending"
                            }`}
                          >
                            <i aria-hidden="true" />
                            <span>Отправка</span>
                          </div>
                        </div>

                        <dl className="subscriber-preferences">
                          <div>
                            <dt>Периодичность</dt>
                            <dd>
                              {frequencyLabels[delivery.subscriber.frequency]}
                            </dd>
                          </div>
                          <div>
                            <dt>Состав</dt>
                            <dd>
                              {delivery.issue.itemCount} новостей ·{" "}
                              {delivery.issue.personalizedCount}/
                              {delivery.issue.generalCount}
                            </dd>
                          </div>
                          <div>
                            <dt>Интересы</dt>
                            <dd>{delivery.subscriber.tags.join(" · ")}</dd>
                          </div>
                        </dl>

                        <div className="delivery-action">
                          <span>
                            {delivery.sentAt
                              ? `Отправлено ${formatAdminTime(delivery.sentAt)}`
                              : `Создан ${formatAdminTime(delivery.createdAt)}`}
                          </span>
                          <button
                            className="button button-signal delivery-send"
                            disabled={!canSend || isSending}
                            onClick={() => sendDelivery(delivery.id)}
                            type="button"
                          >
                            {isSending
                              ? "Отправляем…"
                              : delivery.status === "failed"
                                ? "Повторить отправку"
                                : delivery.status === "sent"
                                  ? "Отправлено"
                                  : delivery.status === "waiting-telegram"
                                    ? "Ждём Telegram"
                                    : "Отправить в Telegram"}
                          </button>
                        </div>
                      </header>

                      <div className="subscriber-issue">
                        <div className="subscriber-issue-title">
                          <div>
                            <span>Выпуск {delivery.issue.id}</span>
                            <strong>Статьи для этого пользователя</strong>
                          </div>
                          <Link href="/preview">Открыть превью ↗</Link>
                        </div>
                        <ol>
                          {delivery.issue.items.map((item) => (
                            <li key={item.id}>
                              <div>
                                <strong>{item.title}</strong>
                                <span>{item.metrics.join(" · ")}</span>
                              </div>
                              <div className="subscriber-article-links">
                                {item.sourceUrls[0] ? (
                                  <a
                                    href={item.sourceUrls[0]}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Открыть статью источника ↗
                                  </a>
                                ) : (
                                  <span>Источник не указан</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>

                        <div className="composition-bar">
                          <span className="composition-origin">
                            {delivery.issue.curated
                              ? "Состав собран редактором вручную"
                              : "Состав собран автоматически по правилу 80/20"}
                          </span>
                          {!canEditComposition ? null : isEditingComposition ? (
                            <span className="composition-actions">
                              <button
                                className="button button-signal"
                                disabled={isSavingComposition}
                                onClick={() => saveComposition(delivery.id)}
                                type="button"
                              >
                                {isSavingComposition
                                  ? "Сохраняем…"
                                  : `Сохранить состав · ${draftItemIds.length}`}
                              </button>
                              <button
                                className="button button-ghost"
                                disabled={isSavingComposition}
                                onClick={() => setEditingDeliveryId(null)}
                                type="button"
                              >
                                Отмена
                              </button>
                            </span>
                          ) : (
                            <button
                              className="button button-ghost"
                              onClick={() => startComposition(delivery)}
                              type="button"
                            >
                              Изменить состав
                            </button>
                          )}
                        </div>

                        {isEditingComposition ? (
                          <div className="composition-picker">
                            <p className="mono-label">
                              Выбрано {draftItemIds.length} из{" "}
                              {approvedMaterials.length} утверждённых · интересы:{" "}
                              {delivery.subscriber.tags.join(" · ")}
                            </p>
                            {approvedMaterials.length === 0 ? (
                              <p className="panel-note">
                                Утверждённых материалов пока нет. Утвердите их в
                                разделе «Материалы».
                              </p>
                            ) : (
                              <ul className="composition-options">
                                {[...approvedMaterials]
                                  .sort((left, right) => {
                                    const leftRank = left.tags.some((tag) =>
                                      delivery.subscriber.tags.includes(tag),
                                    )
                                      ? 0
                                      : 1;
                                    const rightRank = right.tags.some((tag) =>
                                      delivery.subscriber.tags.includes(tag),
                                    )
                                      ? 0
                                      : 1;

                                    if (leftRank !== rightRank) {
                                      return leftRank - rightRank;
                                    }

                                    return right.sourcePublishedAt.localeCompare(
                                      left.sourcePublishedAt,
                                    );
                                  })
                                  .map((material) => {
                                    const matchesInterests = material.tags.some(
                                      (tag) =>
                                        delivery.subscriber.tags.includes(tag),
                                    );

                                    return (
                                      <li key={material.id}>
                                        <label>
                                          <input
                                            checked={draftItemIds.includes(
                                              material.id,
                                            )}
                                            name="draftMaterialIds"
                                            onChange={() =>
                                              toggleDraftItem(material.id)
                                            }
                                            type="checkbox"
                                            value={material.id}
                                          />
                                          <span>
                                            <strong>{material.title}</strong>
                                            <em>
                                              {matchesInterests
                                                ? "По интересам подписчика"
                                                : "Общерыночная"}{" "}
                                              · {material.tags.slice(0, 3).join(" · ")}
                                            </em>
                                          </span>
                                        </label>
                                      </li>
                                    );
                                  })}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}

        {workspace === "materials" ? (
          <div className="admin-grid">
            <section className="admin-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="mono-label">Редакторская очередь</p>
                  <h2>Материалы, цифры и ссылки</h2>
                </div>
                <div className="admin-tabs" role="tablist">
                  {(["all", "review", "approved"] as const).map((tab) => (
                    <button
                      aria-selected={filter === tab}
                      className="admin-tab"
                      key={tab}
                      onClick={() => setFilter(tab)}
                      role="tab"
                      type="button"
                    >
                      {tab === "all"
                        ? "Все"
                        : tab === "review"
                          ? "На проверке"
                          : "Утверждённые"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="material-filters">
                <input
                  aria-label="Поиск по заголовку и тексту"
                  autoComplete="off"
                  className="material-filter-search"
                  name="materialSearch"
                  onChange={(event) => setMaterialSearch(event.target.value)}
                  placeholder="Поиск по заголовку или тексту…"
                  type="search"
                  value={materialSearch}
                />
                <select
                  aria-label="Фильтр по теме"
                  name="materialTag"
                  onChange={(event) => setMaterialTag(event.target.value)}
                  value={materialTag}
                >
                  <option value="">Все темы</option>
                  {materialTagOptions.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Фильтр по источнику"
                  name="materialSource"
                  onChange={(event) => setMaterialSource(event.target.value)}
                  value={materialSource}
                >
                  <option value="">Все источники</option>
                  {materialSourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
                {isMaterialFilterActive ? (
                  <button
                    className="material-filter-reset"
                    onClick={() => {
                      setMaterialSearch("");
                      setMaterialTag("");
                      setMaterialSource("");
                    }}
                    type="button"
                  >
                    Сбросить
                  </button>
                ) : null}
                <span className="material-filter-count">
                  Показано {visibleMaterials.length} из {materials.length}
                </span>
              </div>

              <div className="material-list">
                {visibleMaterials.length === 0 ? (
                  <p className="panel-note">
                    Под фильтр ничего не подошло. Измените запрос, тему или
                    источник.
                  </p>
                ) : null}
                {visibleMaterials.map((material) => (
                  <article className="material-row" key={material.id}>
                    <span className="material-source">
                      {statusLabels[material.status]}
                    </span>
                    <div className="material-copy">
                      <strong>{material.title}</strong>
                      <p>{material.summary}</p>
                      <div className="material-metrics">
                        {material.keyMetrics.slice(0, 2).map((metric) => (
                          <span key={`${metric.value}-${metric.label}`}>
                            <b>{metric.value}</b> {metric.label}
                          </span>
                        ))}
                      </div>
                      <p className="material-money">
                        {material.businessImpact}
                      </p>
                      <div className="material-links">
                        {material.sourceUrls[0] ? (
                          <a
                            href={material.sourceUrls[0]}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Исходная публикация ↗
                          </a>
                        ) : (
                          <span>Ссылка появится после проверки источника</span>
                        )}
                      </div>
                      <div className="material-tags">
                        {material.tags.slice(0, 4).map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="material-actions">
                      <button
                        aria-label={`Утвердить: ${material.title}`}
                        className="icon-button icon-button-approve"
                        onClick={() => setStatus(material.id, "approved")}
                        title="Утвердить"
                        type="button"
                      >
                        ✓
                      </button>
                      <button
                        aria-label={`Вернуть в черновики: ${material.title}`}
                        className="icon-button icon-button-reject"
                        onClick={() => setStatus(material.id, "draft")}
                        title="Вернуть в черновики"
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="side-stack">
              <section className="admin-panel">
                <p className="mono-label">Ближайшая отправка</p>
                <h2>Следующее окно · 12:00</h2>
                <div className="issue-progress" aria-label="Готовность выпуска">
                  <span
                    style={{ width: `${Math.min(approvedCount * 10, 100)}%` }}
                  />
                </div>
                <div className="issue-breakdown">
                  <span>8 персональных</span>
                  <span>2 общерыночных</span>
                </div>
                <p className="panel-note">
                  В 11:30 набор закрывается. Без цифр, значения для бизнеса и
                  проверяемого первоисточника материал не утверждается.
                </p>
              </section>

              <section className="admin-panel">
                <p className="mono-label">Коммерческий маршрут</p>
                <h2>Подходящее мероприятие</h2>
                {matchingEvent ? (
                  <div className="event-card">
                    <span>{matchingEvent.format}</span>
                    <strong>{matchingEvent.name}</strong>
                    <p>
                      {matchingEvent.startsAt} · {matchingEvent.location}
                    </p>
                  </div>
                ) : null}
              </section>
            </aside>
          </div>
        ) : null}

        {workspace === "sources" ? (
          <div className="sources-workspace">
            <section className="admin-panel agent-panel">
              <div>
                <p className="mono-label">Исследовательский контур</p>
                <h2>AI собирает факты, редактор принимает решение</h2>
                <p>
                  Поиск ограничен белым списком доменов. Агент возвращает
                  прямую ссылку, дату, минимум одну цифру и значение для
                  бизнеса.
                </p>
              </div>
              <div className="agent-configuration">
                <span
                  className={
                    agentConfiguration.configured
                      ? "agent-state is-ready"
                      : "agent-state"
                  }
                >
                  {agentConfiguration.configured
                    ? `${agentConfiguration.providerLabel} API подключён`
                    : `Нужен ${agentConfiguration.credentialName}`}
                </span>
                <strong>{agentConfiguration.model}</strong>
                <small>
                  {agentConfiguration.enabledSourceCount} доменов в поиске
                </small>
                <button
                  className="button button-signal"
                  disabled={isCollecting}
                  onClick={collectNews}
                  type="button"
                >
                  {isCollecting
                    ? collectProgress
                      ? `Разбираем порцию ${collectProgress.group} из ${collectProgress.total}…`
                      : "Читаем ленты…"
                    : "Собрать новости из лент"}
                </button>
              </div>
            </section>

            <section className="admin-panel ai-usage-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="mono-label">Фактический usage API</p>
                  <h2>Токены и стоимость AI-обработки</h2>
                </div>
                <span>обновлено {formatAdminTime(aiUsage.generatedAt)}</span>
              </div>
              <div className="ai-usage-grid">
                <article>
                  <span>Стоимость · 24 часа</span>
                  <strong>
                    {formatUsdMicros(aiUsage.last24Hours.costUsdMicros)}
                  </strong>
                </article>
                <article>
                  <span>Токены · 24 часа</span>
                  <strong>
                    {formatTokenCount(aiUsage.last24Hours.totalTokens)}
                  </strong>
                </article>
                <article>
                  <span>Ответы AI · 24 часа</span>
                  <strong>{aiUsage.last24Hours.requestCount}</strong>
                </article>
                <article>
                  <span>Стоимость · всё время</span>
                  <strong>{formatUsdMicros(aiUsage.allTime.costUsdMicros)}</strong>
                </article>
              </div>
              <p className="panel-note">
                Учитываются все успешные ответы провайдера: принятые,
                отфильтрованные и повторные попытки. История начинается с
                момента установки счётчика.
                {aiUsage.allTime.unpricedRequestCount
                  ? ` Без цены от провайдера: ${aiUsage.allTime.unpricedRequestCount}.`
                  : ""}
              </p>
            </section>

            <section className="admin-panel candidate-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="mono-label">Не опубликовано</p>
                  <h2>Кандидаты на редакторскую проверку</h2>
                </div>
                <span className="candidate-count">{candidates.length}</span>
              </div>
              {candidates.length ? (
                <div className="candidate-list">
                  {candidates.map((candidate) => (
                    <article key={candidate.id}>
                      <div>
                        <span>{candidate.sourceName}</span>
                        <strong>{candidate.title}</strong>
                        <p>{candidate.summary}</p>
                        <div className="material-metrics">
                          {candidate.keyMetrics.map((metric) => (
                            <span key={`${metric.value}-${metric.label}`}>
                              <b>{metric.value}</b> {metric.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="candidate-actions">
                        <span>
                          оценка модели {Math.round(candidate.confidence * 100)}% ·
                          структура проверена
                        </span>
                        <a
                          href={candidate.sourceUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Проверить источник ↗
                        </a>
                        <button
                          disabled={
                            candidate.status === "review" ||
                            promotingId === candidate.id
                          }
                          onClick={() => promoteCandidate(candidate.id)}
                          type="button"
                        >
                          {candidate.status === "review"
                            ? "В редакционной очереди"
                            : promotingId === candidate.id
                              ? "Передаём…"
                              : "Передать редактору"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="candidate-empty">
                  Очередь пуста. После запуска агента здесь появятся только
                  кандидаты; автоматической публикации нет.
                </p>
              )}
            </section>

            <section className="admin-panel registry-panel">
              <div className="admin-panel-head">
                <div>
                  <p className="mono-label">Реестр после исследования</p>
                  <h2>{sources.length} источников по всему рынку</h2>
                </div>
                <span>
                  Приоритет 1 — первичный / профильный · Telegram — вручную
                </span>
              </div>
              <div className="source-grid">
                {sources.map((source) => (
                  <article key={source.id}>
                    <div>
                      <span>{source.kind.replaceAll("-", " ")}</span>
                      <b>Приоритет {source.priority}</b>
                    </div>
                    <a
                      href={source.homepageUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.name} ↗
                    </a>
                    <p>{source.note}</p>
                    <small>{source.topics.join(" · ")}</small>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
