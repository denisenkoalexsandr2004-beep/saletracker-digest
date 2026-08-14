"use client";

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
import type { NewsSource } from "@/features/news-sources/news-source.types";
import {
  frequencyLabels,
  roleLabels,
} from "@/features/subscriptions/subscription.types";

interface AdminConsoleProps {
  initialMaterials: Material[];
  initialDeliveries: DigestDeliveryView[];
  initialCandidates: NewsCandidate[];
  sources: NewsSource[];
  agentConfiguration: {
    configured: boolean;
    model: string;
    enabledSourceCount: number;
    totalSourceCount: number;
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
  };
  detail?: string;
  message?: string;
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

export function AdminConsole({
  initialMaterials,
  initialDeliveries,
  initialCandidates,
  sources,
  agentConfiguration,
  events,
}: AdminConsoleProps) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [deliveries, setDeliveries] = useState(initialDeliveries);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [workspace, setWorkspace] =
    useState<AdminWorkspace>("subscribers");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const visibleMaterials = useMemo(
    () =>
      materials.filter((material) => {
        if (filter === "all") {
          return true;
        }
        return material.status === filter;
      }),
    [filter, materials],
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

  async function collectNews() {
    setIsCollecting(true);
    setQueueNotice(null);

    try {
      const response = await fetch("/api/admin/ingestion-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7, maxCandidates: 8 }),
      });
      const body = (await response.json()) as IngestionResponse;

      if (!response.ok || !body.data) {
        throw new Error(body.detail ?? "Не удалось запустить AI-сбор.");
      }

      setCandidates((current) => {
        const knownUrls = new Set(current.map((item) => item.sourceUrl));
        return [
          ...body.data!.candidates.filter(
            (item) => !knownUrls.has(item.sourceUrl),
          ),
          ...current,
        ];
      });
      setQueueNotice({
        type: "success",
        text:
          body.message ??
          `Собрано кандидатов: ${body.data.candidates.length}.`,
      });
    } catch (error) {
      setQueueNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Не удалось запустить AI-сбор.",
      });
    } finally {
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
        <Link className="brand" href="/">
          <span className="brand-mark">ST</span>
          <span>SaleTracker / Редакция</span>
        </Link>
        <div className="admin-user">
          <i aria-hidden="true" />
          <span>Защищённая сессия редактора</span>
          <button onClick={signOut} type="button">
            Выйти
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-title-row">
          <div>
            <p className="section-kicker">Пятница, 24 июля</p>
            <h1>Пульт выпусков</h1>
            <p>До закрытия набора на ближайший выпуск · 47 минут</p>
          </div>
          <a className="button button-signal" href="/preview">
            Проверить Telegram-выпуск ↗
          </a>
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

              <div className="material-list">
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
                    ? "API подключён"
                    : "Нужен OPENAI_API_KEY"}
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
                  {isCollecting ? "Агент исследует…" : "Собрать реальные новости"}
                </button>
              </div>
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
