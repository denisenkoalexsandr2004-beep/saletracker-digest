export type NewsSourceKind =
  | "official-data"
  | "regulator"
  | "association"
  | "research"
  | "industry-media"
  | "business-media"
  | "company"
  | "social";

export type NewsSourceCollectionMode =
  | "web-search"
  | "rss"
  | "official-api"
  | "manual";

export interface NewsSource {
  id: string;
  name: string;
  homepageUrl: string;
  searchDomain: string;
  kind: NewsSourceKind;
  collectionMode: NewsSourceCollectionMode;
  priority: 1 | 2 | 3;
  /**
   * Адрес RSS/Atom-ленты, если издание её публикует. Лента отдаёт все
   * материалы за период целиком, тогда как веб-поиск возвращает выборку.
   */
  feedUrl?: string;
  topics: string[];
  note: string;
  enabledForAgent: boolean;
}
