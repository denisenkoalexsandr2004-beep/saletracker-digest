import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <Image
          alt="Сейл Трекер"
          height={40}
          src="/brand/saletracker-logo.svg"
          width={194}
        />
        <p>
          Персональные отраслевые новости для поставщиков и закупщиков
          торговых сетей.
        </p>
      </div>
      <div className="footer-links">
        <Link href="/preview">Пример выпуска</Link>
        <Link href="/#setup">Настроить дайджест</Link>
        <Link href="/admin">Войти</Link>
        <a href="https://platforma-czs.ru/">Платформа ЦЗС</a>
      </div>
    </footer>
  );
}
