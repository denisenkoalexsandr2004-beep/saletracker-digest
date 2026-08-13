import Link from "next/link";

interface SiteHeaderProps {
  telegramBotUrl?: string;
}

export function SiteHeader({ telegramBotUrl }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="SaleTracker — Дайджесты">
        <span className="brand-mark" aria-hidden="true">
          ST
        </span>
        <span>SaleTracker / Дайджесты</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/preview">Пример выпуска</Link>
        <Link href="/admin">Демо админки</Link>
        {telegramBotUrl ? (
          <a href={telegramBotUrl} rel="noreferrer" target="_blank">
            Telegram-бот
          </a>
        ) : null}
        <Link className="nav-cta" href="/#setup">
          Настроить
        </Link>
      </nav>
    </header>
  );
}
