import Image from "next/image";
import Link from "next/link";

interface SiteHeaderProps {
  telegramBotUrl?: string;
}

export function SiteHeader({ telegramBotUrl }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="SaleTracker — Дайджесты">
        <Image
          alt="Сейл Трекер"
          height={40}
          priority
          src="/brand/saletracker-logo.svg"
          width={194}
        />
        <span className="brand-product">Дайджесты</span>
      </Link>

      <nav className="site-nav" aria-label="Основная навигация">
        <Link href="/preview">Пример выпуска</Link>
        {telegramBotUrl ? (
          <a href={telegramBotUrl} rel="noreferrer" target="_blank">
            Telegram-бот
          </a>
        ) : null}
        <Link className="nav-cta" href="/#setup">
          Настроить дайджест
        </Link>
        <Link className="nav-login" href="/admin">
          Войти
        </Link>
      </nav>
    </header>
  );
}
