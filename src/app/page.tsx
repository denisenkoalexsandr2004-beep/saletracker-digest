import Link from "next/link";

import { SignalBoard } from "@/features/digests/components/signal-board";
import { digestTags } from "@/features/subscriptions/subscription.categories";
import { SubscriptionBuilder } from "@/features/subscriptions/components/subscription-builder";
import { SiteFooter } from "@/shared/components/site-footer";
import { SiteHeader } from "@/shared/components/site-header";
import { env } from "@/shared/config/env";

const principles = [
  {
    title: "Точно по вашей категории",
    body: "80% выпуска совпадает с выбранными интересами. Остальное — действительно важные сигналы рынка.",
  },
  {
    title: "Сначала проверка, потом отправка",
    body: "AI собирает и группирует сюжеты, редактор подтверждает факты и утверждает материал один раз.",
  },
  {
    title: "Не просто читать — действовать",
    body: "Финальный блок ведёт на подходящее мероприятие ЦЗС для переговоров с нужными партнёрами.",
  },
] as const;

export default function HomePage() {
  const telegramBotUrl = env.TELEGRAM_BOT_USERNAME
    ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}`
    : undefined;

  return (
    <>
      <SiteHeader telegramBotUrl={telegramBotUrl} />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Новая опция SaleTracker</p>
            <h1>
              Новости рынка, которые ведут <span>к действию.</span>
            </h1>
            <p>
              Персональные дайджесты для поставщиков и закупщиков: только
              проверенные сигналы по вашим категориям, в Telegram и по
              понятному расписанию.
            </p>
            <div className="hero-actions">
              <a className="button button-signal" href="#setup">
                Настроить мой выпуск
              </a>
              <Link className="button button-ghost" href="/preview">
                Посмотреть пример <span aria-hidden="true">↗</span>
              </Link>
              {telegramBotUrl ? (
                <a
                  className="button button-telegram"
                  href={telegramBotUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Открыть Telegram-бота ↗
                </a>
              ) : null}
            </div>
            <div className="hero-note">
              <span className="live-dot" aria-hidden="true" />
              Редакторская проверка · правило 80/20 · CTA на ЦЗС
            </div>
          </div>
          <SignalBoard />
        </section>

        <section className="section">
          <p className="section-kicker">Что меняется</p>
          <h2 className="section-heading">
            Из новостного шума — в рабочий сигнал
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
            <p className="section-kicker">Подключение Telegram</p>
            <h2>Бот получает право писать только после вашего Start</h2>
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
              <p className="section-kicker">Настройка за 2 минуты</p>
              <h2 className="section-heading">
                Соберите свой информационный радар
              </h2>
              <p className="section-lead">
                На этапе пилота дайджесты бесплатны. Выберите темы, удобный
                ритм и объём выпуска — остальное подготовит редакция.
              </p>
              <div className="builder-meta">
                <span>Пилотный доступ · бесплатно</span>
                <span>11:30 · редакционный cutoff</span>
                <span>12:00 · отправка в Telegram</span>
                <span>100% · утверждённые материалы</span>
              </div>
            </div>
            <SubscriptionBuilder availableTags={digestTags} />
          </div>
        </section>

        <section className="czs-section">
          <div>
            <p className="section-kicker">ЦЗС — ядро проекта</p>
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
