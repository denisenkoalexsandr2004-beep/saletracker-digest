"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  digestSizeOptions,
  frequencies,
  frequencyLabels,
  roleLabels,
  type DigestFrequency,
  type DigestTargetSize,
  type SubscriberRole,
} from "@/features/subscriptions/subscription.types";

interface SubscriptionBuilderProps {
  availableTags: readonly string[];
}

interface FormFields {
  name: string;
  company: string;
  email: string;
}

interface SuccessState {
  integrationMode: "telegram" | "demo";
  nextStepUrl: string;
  connectionToken: string;
  message: string;
  telegramStatus?: "waiting" | "connected" | "sent" | "failed";
}

const roleOrder: SubscriberRole[] = ["supplier", "buyer", "both"];
const INITIAL_CATEGORY_COUNT = 24;
const MAX_SELECTED_CATEGORIES = 20;

export function SubscriptionBuilder({
  availableTags,
}: SubscriptionBuilderProps) {
  const [role, setRole] = useState<SubscriberRole>("supplier");
  const [tags, setTags] = useState<string[]>([
    "Молочная продукция",
    "СТМ",
  ]);
  const [frequency, setFrequency] =
    useState<DigestFrequency>("weekly");
  const [targetSize, setTargetSize] = useState<DigestTargetSize>(10);
  const [fields, setFields] = useState<FormFields>({
    name: "",
    company: "",
    email: "",
  });
  const [consent, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);
  const connectionToken = success?.connectionToken;
  const integrationMode = success?.integrationMode;
  const telegramStatus = success?.telegramStatus;
  const deferredCategoryQuery = useDeferredValue(categoryQuery);
  const normalizedCategoryQuery = deferredCategoryQuery.trim().toLowerCase();
  const matchingTags = useMemo(
    () =>
      normalizedCategoryQuery
        ? availableTags.filter((tag) =>
            tag.toLowerCase().includes(normalizedCategoryQuery),
          )
        : availableTags,
    [availableTags, normalizedCategoryQuery],
  );
  const visibleTags =
    normalizedCategoryQuery || showAllCategories
      ? matchingTags
      : matchingTags.slice(0, INITIAL_CATEGORY_COUNT);

  useEffect(() => {
    if (
      integrationMode !== "telegram" ||
      !connectionToken ||
      telegramStatus === "sent"
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const checkTelegram = async () => {
      attempts += 1;

      try {
        const response = await fetch(
          `/api/subscriptions/${encodeURIComponent(connectionToken)}/telegram-status`,
          { method: "POST" },
        );
        const body = await response.json();

        if (!cancelled && response.ok) {
          const nextTelegramStatus =
            body.data.deliveryStatus === "sent"
              ? "sent"
              : body.data.deliveryStatus === "failed"
                ? "failed"
                : body.data.connected
                  ? "connected"
                  : "waiting";

          setSuccess((current) =>
            current
              ? {
                  ...current,
                  telegramStatus: nextTelegramStatus,
                  message:
                    nextTelegramStatus === "sent"
                      ? "Telegram подключён — первый выпуск отправлен."
                      : current.message,
                }
              : current,
          );

          if (nextTelegramStatus === "sent") {
            return;
          }
        }
      } catch {
        // Следующая попытка восстановит проверку после краткого сбоя сети.
      }

      if (!cancelled && attempts < 48) {
        timer = setTimeout(checkTelegram, 2_500);
      }
    };

    timer = setTimeout(checkTelegram, 2_500);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [connectionToken, integrationMode, telegramStatus]);

  function changeFrequency(nextFrequency: DigestFrequency) {
    setFrequency(nextFrequency);
    setSuccess(null);
  }

  function toggleTag(tag: string) {
    setFieldErrors((current) => ({ ...current, tags: "" }));
    setSuccess(null);
    setTags((current) => {
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag);
      }

      if (current.length >= MAX_SELECTED_CATEGORIES) {
        setFieldErrors((errors) => ({
          ...errors,
          tags: `Можно выбрать не более ${MAX_SELECTED_CATEGORIES} направлений.`,
        }));
        return current;
      }

      return [...current, tag];
    });
  }

  function updateField(field: keyof FormFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: "" }));
    setSuccess(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFieldErrors({});
    setSuccess(null);

    try {
      const response = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...fields,
          role,
          tags,
          frequency,
          targetSize,
          consent,
        }),
      });
      const body = await response.json();

      if (!response.ok) {
        setFieldErrors(
          body.fields ?? {
            form: body.detail ?? "Не удалось сохранить настройки.",
          },
        );
        return;
      }

      setSuccess({
        integrationMode: body.data.integrationMode,
        nextStepUrl: body.data.nextStepUrl,
        connectionToken: body.data.connectionToken,
        message: body.message,
        telegramStatus:
          body.data.integrationMode === "telegram" ? "waiting" : undefined,
      });
    } catch {
      setFieldErrors({
        form: "Нет соединения с сервером. Проверьте, запущено ли приложение.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="subscription-builder digest-builder"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="builder-step">
        <div className="builder-step__heading">
          <span className="step-index">01</span>
          <div>
            <h3>Кто вы на рынке</h3>
            <p>От роли зависит финальное приглашение на мероприятие ЦЗС.</p>
          </div>
        </div>
        <div className="role-switch" role="radiogroup" aria-label="Ваша роль">
          {roleOrder.map((item) => (
            <button
              aria-checked={role === item}
              className={role === item ? "choice is-selected" : "choice"}
              key={item}
              onClick={() => {
                setRole(item);
                setSuccess(null);
              }}
              role="radio"
              type="button"
            >
              {roleLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-step">
        <div className="builder-step__heading">
          <span className="step-index">02</span>
          <div>
            <h3>Сигналы, которые важны</h3>
            <p>
              Выбрано направлений: {tags.length} из{" "}
              {MAX_SELECTED_CATEGORIES}. Материалы проходят редакторскую
              проверку.
            </p>
          </div>
        </div>
        <label className="category-search">
          <span className="category-search__icon" aria-hidden="true">
            ⌕
          </span>
          <span className="sr-only">Поиск по категориям</span>
          <input
            autoComplete="off"
            onChange={(event) => setCategoryQuery(event.target.value)}
            placeholder="Найти категорию: напитки, логистика, косметика…"
            type="search"
            value={categoryQuery}
          />
          <span className="category-search__count">
            {matchingTags.length}
          </span>
        </label>
        <div className="tag-list" aria-label="Интересы">
          {visibleTags.map((tag) => (
            <button
              aria-pressed={tags.includes(tag)}
              className={tags.includes(tag) ? "tag is-selected" : "tag"}
              key={tag}
              onClick={() => toggleTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
        {matchingTags.length === 0 ? (
          <p className="category-empty">
            Направление не найдено. Попробуйте более короткий запрос.
          </p>
        ) : null}
        {!normalizedCategoryQuery &&
        availableTags.length > INITIAL_CATEGORY_COUNT ? (
          <button
            className="category-expand"
            onClick={() => setShowAllCategories((current) => !current)}
            type="button"
          >
            {showAllCategories
              ? "Свернуть каталог"
              : `Показать все направления · ${availableTags.length}`}
          </button>
        ) : null}
        {fieldErrors.tags ? (
          <p className="field-error" role="alert">
            {fieldErrors.tags}
          </p>
        ) : null}
      </div>

      <div className="builder-step builder-step--split">
        <div>
          <div className="builder-step__heading">
            <span className="step-index">03</span>
            <div>
              <h3>Ритм</h3>
              <p>Отправка в 12:00 МСК.</p>
            </div>
          </div>
          <div className="stacked-choices" role="radiogroup">
            {frequencies.map((item) => (
              <button
                aria-checked={frequency === item}
                className={frequency === item ? "line-choice is-selected" : "line-choice"}
                key={item}
                onClick={() => changeFrequency(item)}
                role="radio"
                type="button"
              >
                <span>{frequencyLabels[item]}</span>
                <span className="line-choice__mark" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="builder-step__heading builder-step__heading--without-index">
            <div>
              <h3>Объём</h3>
              <p>Без искусственного заполнения.</p>
            </div>
          </div>
          <div className="size-choices" role="radiogroup">
            {digestSizeOptions.map((size) => (
              <button
                aria-checked={targetSize === size}
                className={targetSize === size ? "size-choice is-selected" : "size-choice"}
                key={size}
                onClick={() => {
                  setTargetSize(size);
                  setSuccess(null);
                }}
                role="radio"
                type="button"
              >
                <strong>{size}</strong>
                <span>новостей</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="builder-step">
        <div className="builder-step__heading">
          <span className="step-index">04</span>
          <div>
            <h3>Куда отправить</h3>
            <p>После сохранения подключим Telegram по персональной ссылке.</p>
          </div>
        </div>
        <div className="contact-grid">
          <label>
            <span>Имя</span>
            <input
              autoComplete="name"
              name="name"
              onChange={(event) => updateField("name", event.target.value)}
              value={fields.name}
            />
            {fieldErrors.name ? (
              <small className="field-error">{fieldErrors.name}</small>
            ) : null}
          </label>
          <label>
            <span>Компания</span>
            <input
              autoComplete="organization"
              name="company"
              onChange={(event) => updateField("company", event.target.value)}
              value={fields.company}
            />
            {fieldErrors.company ? (
              <small className="field-error">{fieldErrors.company}</small>
            ) : null}
          </label>
          <label className="contact-grid__wide">
            <span>Рабочий email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => updateField("email", event.target.value)}
              type="email"
              value={fields.email}
            />
            {fieldErrors.email ? (
              <small className="field-error">{fieldErrors.email}</small>
            ) : null}
          </label>
        </div>
        <label className="consent">
          <input
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              setFieldErrors((current) => ({ ...current, consent: "" }));
              setSuccess(null);
            }}
            type="checkbox"
          />
          <span>
            Согласен на обработку данных и получение выбранных материалов.
          </span>
        </label>
        {fieldErrors.consent ? (
          <p className="field-error" role="alert">
            {fieldErrors.consent}
          </p>
        ) : null}
      </div>

      <div className="builder-submit">
        <div>
          <span className="builder-submit__label">Ваш выпуск</span>
          <strong>
            {frequencyLabels[frequency]} · до {targetSize} новостей
          </strong>
          <p>
            {tags.length > 0 ? tags.join(" · ") : "Выберите хотя бы один тег"}
          </p>
        </div>
        <button
          className="button button--signal"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Сохраняем…" : "Получить дайджест"}
        </button>
      </div>

      {fieldErrors.form ? (
        <div className="form-message form-message--error" role="alert">
          {fieldErrors.form}
        </div>
      ) : null}

      {success ? (
        <div className="form-message form-message--success" role="status">
          <div>
            <strong>{success.message}</strong>
            <p>
              {success.integrationMode === "demo"
                ? "Пока бот не настроен, открываем полностью сформированный демовыпуск."
                : success.telegramStatus === "sent"
                  ? "Готово: выпуск уже находится в вашем чате с ботом."
                  : success.telegramStatus === "connected"
                    ? "Start получен. Бот завершает отправку первого выпуска."
                    : success.telegramStatus === "failed"
                      ? "Telegram подключён, но отправка не завершилась. Повторите /start или отправку из админки."
                      : "Откройте персональную ссылку и нажмите Start — бот сразу пришлёт первый персональный выпуск."}
            </p>
          </div>
          <a
            className="button button--ink"
            href={success.nextStepUrl}
            rel="noreferrer"
            target={success.integrationMode === "telegram" ? "_blank" : undefined}
          >
            {success.integrationMode === "demo"
              ? "Посмотреть выпуск"
              : "Открыть бота и нажать Start"}
          </a>
        </div>
      ) : null}
    </form>
  );
}
