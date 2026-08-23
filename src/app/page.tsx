import Link from "next/link";

import { digestTags } from "@/features/subscriptions/subscription.categories";
import { SubscriptionBuilder } from "@/features/subscriptions/components/subscription-builder";
import { SiteFooter } from "@/shared/components/site-footer";
import { SiteHeader } from "@/shared/components/site-header";
import { env } from "@/shared/config/env";

const principles = [
  {
    title: "Вы выбираете интересы",
    body: "Роль, категории, частоту и объём выпуска можно настроить за несколько минут.",
  },
  {
    title: "Система проверяет новости",
    body: "ИИ собирает и группирует сюжеты, а редактор подтверждает факты перед публикацией.",
  },
  {
    title: "Бот отправляет выпуск",
    body: "В назначенное время вы получаете короткий дайджест и следующий деловой шаг в Telegram.",
  },
] as const;

const metrics = [
  { value: "80%", label: "новостей по выбранным интересам" },
  { value: "2×", label: "проверка ключевых фактов" },
  { value: "12:00", label: "плановая отправка в Telegram" },
  { value: "5–10", label: "новостей в одном выпуске" },
] as const;

function SupplierIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path d="M7 12h18l-2 14H9L7 12Z" />
      <path d="m10 12 2-6h8l2 6M13 17h6" />
    </svg>
  );
}

function BuyerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32">
      <path d="M5 7h3l3 14h12l3-10H9" />
      <circle cx="13" cy="26" r="1.5" />
      <circle cx="22" cy="26" r="1.5" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="M3.5 13.5h9M5 13.5V7.75h6v5.75M6.5 7.75V4.5h3v3.25M7 10h2M8 4.5V2.5" />
    </svg>
  );
}

export default function HomePage() {
  const telegramBotUrl = env.TELEGRAM_BOT_USERNAME
    ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}`
    : undefined;

  return (
    <>
      <SiteHeader telegramBotUrl={telegramBotUrl} />
      <main className="marketing-home" id="main-content">
        <section className="platform-hero">
          <div className="platform-hero__inner">
            <p className="platform-badge">
              <BadgeIcon />
              Новости для участников рынка
            </p>
            <h1>
              Ваш рынок — <span>в одном персональном дайджесте</span>
            </h1>
            <p className="platform-hero__lead">
              SaleTracker собирает отраслевые новости, проверяет факты и
              отправляет только важные сигналы по вашим категориям прямо в
              Telegram.
            </p>

            <div className="audience-grid">
              <article className="audience-card audience-card--supplier">
                <SupplierIcon />
                <div>
                  <h2>Я поставщик</h2>
                  <p>
                    Хочу следить за спросом сетей, конкурентами и изменениями
                    в своей товарной категории.
                  </p>
                </div>
                <ul>
                  <li>Новости по выбранным товарам</li>
                  <li>Сигналы закупок и логистики</li>
                  <li>Подходящие мероприятия ЦЗС</li>
                </ul>
                <a className="audience-cta" href="#setup">
                  Настроить для поставщика <span aria-hidden="true">→</span>
                </a>
              </article>

              <article className="audience-card audience-card--buyer">
                <BuyerIcon />
                <div>
                  <h2>Я торговая сеть</h2>
                  <p>
                    Хочу видеть новых поставщиков, тренды ассортимента и
                    важные изменения рынка.
                  </p>
                </div>
                <ul>
                  <li>Новости поставщиков и брендов</li>
                  <li>Категорийные тренды и цены</li>
                  <li>Только проверенные материалы</li>
                </ul>
                <a className="audience-cta" href="#setup">
                  Настроить для закупщика <span aria-hidden="true">→</span>
                </a>
              </article>
            </div>

            <Link className="platform-preview-link" href="/preview">
              Посмотреть пример готового выпуска
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>

        <section className="platform-metrics" aria-label="Параметры дайджеста">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </div>
          ))}
        </section>

        <section className="section process-section">
          <p className="section-kicker">Как это работает</p>
          <h2 className="section-heading">
            От интересов до готового выпуска
          </h2>
          <div className="principles-grid">
            {principles.map((principle, index) => (
              <article className="principle-card" key={principle.title}>
                <span className="principle-index">0{index + 1}</span>
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="telegram-connect-section">
          <div>
            <p className="section-kicker">Telegram</p>
            <h2>Подключите бота одним нажатием Start</h2>
            <p>
              Сначала настройте интересы. Сервис создаст персональную ссылку,
              по которой Telegram откроет бота с защищённым токеном подписки.
              После нажатия Start бот сразу отправит первый персональный
              выпуск.
            </p>
          </div>
          <ol>
            <li>
              <span>01</span>
              <strong>Настройте выпуск</strong>
              <p>Роль, категории, периодичность и объём.</p>
            </li>
            <li>
              <span>02</span>
              <strong>Откройте бота</strong>
              <p>Сайт сформирует вашу персональную Telegram-ссылку.</p>
            </li>
            <li>
              <span>03</span>
              <strong>Нажмите Start</strong>
              <p>Только после этого бот сможет присылать дайджесты.</p>
            </li>
          </ol>
          {telegramBotUrl ? (
            <a
              className="button button-telegram"
              href={telegramBotUrl}
              rel="noreferrer"
              target="_blank"
            >
              Перейти в Telegram-бота ↗
            </a>
          ) : null}
        </section>

        <section className="builder-section" id="setup">
          <div className="builder-layout">
            <div className="builder-intro">
              <p className="section-kicker">Персональная настройка</p>
              <h2 className="section-heading">
                Соберите свой дайджест
              </h2>
              <p className="section-lead">
                На этапе пилота дайджесты бесплатны. Выберите темы, удобный
                ритм и объём выпуска — остальное подготовит редакция.
              </p>
              <div className="builder-meta">
                <span>Пилотный доступ · бесплатно</span>
                <span>11:30 · завершение проверки</span>
                <span>12:00 · отправка в Telegram</span>
                <span>100% · проверенные материалы</span>
              </div>
            </div>
            <SubscriptionBuilder availableTags={digestTags} />
          </div>
        </section>

        <section className="czs-section">
          <div>
            <p className="section-kicker">Следующий шаг</p>
            <h2>Интерес к категории превращается во встречу</h2>
            <p>
              Дайджест Платформы Сейл Трекер сопоставляет интересы подписчика с
              календарём Центра Закупок Сетей. ЦЗС связывает отраслевой сигнал
              с переговорами, а каждый переход фиксируется как источник лида.
            </p>
          </div>
          <a
            className="button button-signal"
            href="https://platforma-czs.ru/"
          >
            Календарь ЦЗС ↗
          </a>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
