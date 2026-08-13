import type { Metadata } from "next";

import { DigestPreview } from "@/features/digests/components/digest-preview";
import { buildDigestIssue } from "@/features/digests/digest.service";
import { SiteFooter } from "@/shared/components/site-footer";
import { SiteHeader } from "@/shared/components/site-header";
import { env } from "@/shared/config/env";
import { demoEvents, demoMaterials } from "@/shared/demo-data";

export const metadata: Metadata = {
  title: "Пример Telegram-выпуска",
};

const previewIssue = buildDigestIssue({
  role: "supplier",
  tags: ["Молочная продукция", "СТМ", "Логистика"],
  targetSize: 10,
  frequency: "twice-weekly",
  since: "2026-07-14T00:00:00+03:00",
  materials: demoMaterials,
  events: demoEvents,
  now: "2026-07-24T12:00:00+03:00",
});

export default function PreviewPage() {
  const approvedAvailable = demoMaterials.filter(
    (material) => material.status === "approved",
  ).length;
  const coverage = Math.round(
    (previewIssue.items.length / previewIssue.targetSize) * 100,
  );

  return (
    <div className="subpage">
      <SiteHeader />
      <main>
        <header className="subpage-head">
          <p className="section-kicker">Демонстрационный выпуск</p>
          <h1>Так дайджест приходит в Telegram</h1>
          <p>
            Сначала — персональное приветствие и дата выпуска. Затем
            нумерованные новости, аналитический вывод и заметная ссылка на
            оригинальную статью первоисточника.
          </p>
        </header>

        <div className="preview-layout">
          <DigestPreview appUrl={env.NEXT_PUBLIC_APP_URL} issue={previewIssue} />

          <aside className="preview-panel">
            <p className="mono-label">Контроль выпуска</p>
            <h2>Поставщик · молочная категория</h2>
            <div className="metric-list">
              <div className="metric-row">
                <span>Утверждено в базе</span>
                <strong>{approvedAvailable}</strong>
              </div>
              <div className="metric-row">
                <span>Точных совпадений</span>
                <strong>{previewIssue.personalizedCount} · 80%</strong>
              </div>
              <div className="metric-row">
                <span>Общерыночных</span>
                <strong>{previewIssue.generalCount} · 20%</strong>
              </div>
              <div className="metric-row">
                <span>Целевой объём</span>
                <strong>{previewIssue.targetSize} новостей</strong>
              </div>
              <div className="metric-row">
                <span>Покрытие</span>
                <strong>{coverage}%</strong>
              </div>
              <div className="metric-row">
                <span>Подходящее событие</span>
                <strong>{previewIssue.event?.name ?? "Календарь ЦЗС"}</strong>
              </div>
            </div>
            <p className="panel-note">
              Материал со статусом «на проверке» не попал в выпуск, хотя у него
              максимальная важность. Недостающие новости система не выдумывает.
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
