import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/shared/components/site-footer";
import { SiteHeader } from "@/shared/components/site-header";
import { demoMaterials } from "@/shared/demo-data";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

function findMaterial(slug: string) {
  return demoMaterials.find(
    (material) => material.articlePath === `/blog/${slug}`,
  );
}

export function generateStaticParams() {
  return demoMaterials
    .filter((material) => material.status === "approved")
    .map((material) => ({
      slug: material.articlePath.replace("/blog/", ""),
    }));
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const material = findMaterial(slug);

  return material
    ? {
        title: material.title,
        description: material.summary,
      }
    : {};
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const material = findMaterial(slug);

  if (!material || material.status !== "approved") {
    notFound();
  }

  return (
    <>
      <SiteHeader />
      <main className="article" id="main-content">
        <Link className="article-back" href="/preview">
          ← Вернуться к выпуску
        </Link>
        <p className="section-kicker">Аналитика SaleTracker</p>
        <h1>{material.title}</h1>
        <p className="article-deck">{material.summary}</p>

        <div className="article-meta">
          <span>Редакция Платформы Сейл Трекер</span>
          <span>
            {material.approvedAt
              ? new Intl.DateTimeFormat("ru-RU", {
                  dateStyle: "long",
                  timeZone: "Europe/Moscow",
                }).format(new Date(material.approvedAt))
              : ""}
          </span>
        </div>

        <section className="article-numbers" aria-label="Ключевые цифры">
          <p className="mono-label">Ключевые цифры</p>
          <div>
            {material.keyMetrics.map((metric) => (
              <article key={`${metric.value}-${metric.label}`}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <p>{metric.context}</p>
              </article>
            ))}
          </div>
        </section>

        <h2>Что произошло</h2>
        <p>{material.summary}</p>
        <p>
          Редакция SaleTracker сопоставила сообщения{" "}
          {material.sourceNames.join(", ")} и выделила общий отраслевой сигнал.
          В фокусе анализа — {material.tags.join(", ").toLowerCase()} и влияние
          изменений на коммерческие переговоры.
        </p>

        <div className="article-impact">
          <p className="mono-label">Значение для бизнеса</p>
          <h2>Почему это важно</h2>
          <p>{material.businessImpact}</p>
          <h2>Что это означает для рынка</h2>
          <p>{material.impact}</p>
        </div>

        <h2>На что обратить внимание</h2>
        <p>
          Поставщикам стоит проверить, отражён ли этот фактор в коммерческом
          предложении, расчёте поставок и аргументации для категорийного
          менеджера. Закупщикам — оценить влияние на критерии отбора, наличие
          товара и экономику категории. Следующий практический шаг — зафиксировать
          измеримый показатель и обсудить его на переговорах с партнёром.
        </p>

        <div className="tag-grid" aria-label="Теги материала">
          {material.tags.map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>

        <p className="article-sources">
          По материалам: {material.sourceNames.join(", ")}.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
