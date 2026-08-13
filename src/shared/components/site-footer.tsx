import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>SaleTracker / Дайджесты</strong>
        <div>
          Отраслевые новости для поставщиков и закупщиков · пилотная редакция
        </div>
      </div>
      <div className="footer-links">
        <Link href="/preview">Пример выпуска</Link>
        <Link href="/admin">Админка</Link>
        <a href="https://platforma-czs.ru/">Платформа ЦЗС</a>
      </div>
    </footer>
  );
}
