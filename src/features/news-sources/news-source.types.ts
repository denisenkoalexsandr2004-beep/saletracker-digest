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
  topics: string[];
  note: string;
  enabledForAgent: boolean;
}
