import { createDigestGreeting } from "@/features/deliveries/digest-delivery.service";
import type { DigestIssue } from "@/features/digests/digest.types";
import { createTelegramDeliveryPlan } from "@/features/telegram/telegram.formatter";

interface DigestPreviewProps {
  issue: DigestIssue;
  appUrl: string;
}

export function DigestPreview({ issue, appUrl }: DigestPreviewProps) {
  const messages = createTelegramDeliveryPlan(issue, appUrl);
  const greeting = createDigestGreeting(issue, "Александр")
    .split("\n")[0]
    .replaceAll("<b>", "")
    .replaceAll("</b>", "");
  const materialById = new Map(
    issue.items.map((material) => [material.id, material]),
  );

  return (
    <div className="phone-frame">
      <div className="telegram-top">
        <div>
          <strong>Дайджест Платформы Сейл Трекер</strong>
          <span>бот · выпуск сформирован автоматически</span>
        </div>
        <span aria-hidden="true">•••</span>
      </div>

      <section className="telegram-message telegram-message--greeting">
        <p>
          <strong>{greeting}</strong>
        </p>
        <p>
          Редакция Платформы Сейл Трекер подготовила для вас персональный
          дайджест на 24 июля 2026 года.
        </p>
        <p>
          В выпуске — {issue.items.length} новостей:{" "}
          {issue.personalizedCount} по выбранным интересам и{" "}
          {issue.generalCount} общерыночных.
        </p>
        <div className="telegram-time">12:00 ✓✓</div>
      </section>

      {messages.map((message, messageIndex) => {
        const materials = message.itemIds.flatMap((id) => {
          const material = materialById.get(id);
          return material ? [material] : [];
        });

        return (
          <section
            className="telegram-message"
            key={`message-${messageIndex + 1}`}
          >
            {materials.map((material) => (
              <article className="telegram-story" key={material.id}>
                <h2>
                  {issue.items.findIndex((item) => item.id === material.id) + 1}
                  . {material.title}
                </h2>
                <p>{material.summary}</p>
                <div className="telegram-story-metrics">
                  <strong>📊 Ключевые цифры</strong>
                  {material.keyMetrics.slice(0, 2).map((metric) => (
                    <p key={`${metric.value}-${metric.label}`}>
                      <b>{metric.value}</b> — {metric.label}
                      <span>{metric.context}</span>
                    </p>
                  ))}
                </div>
                <p>
                  <strong>Почему это важно:</strong>{" "}
                  {material.businessImpact}
                </p>
                <p>{material.impact}</p>
                <p className="telegram-story-more">
                  <strong>Подробнее:</strong>{" "}
                  <a
                    href={material.sourceUrls[0] ?? material.articlePath}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Открыть статью ·{" "}
                    {material.sourceNames[0] ?? "первоисточник"} ↗
                  </a>
                </p>
              </article>
            ))}

            {message.includesCta ? (
              <div className="telegram-cta">
                <strong>Платформа «Центр Закупок Сетей»</strong>
                <p>{issue.cta}</p>
                <a href={issue.ctaUrl}>
                  Календарь ближайших мероприятий
                  {issue.event ? ` · ${issue.event.name}` : ""} ↗
                </a>
              </div>
            ) : null}

            <div className="telegram-time">12:00 ✓✓</div>
          </section>
        );
      })}
    </div>
  );
}
