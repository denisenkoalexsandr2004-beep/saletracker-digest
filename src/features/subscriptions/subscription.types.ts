export const roles = ["supplier", "buyer", "both"] as const;
export type SubscriberRole = (typeof roles)[number];

export const frequencies = [
  "daily",
  "twice-weekly",
  "weekly",
  "monthly",
] as const;
export type DigestFrequency = (typeof frequencies)[number];

export const digestSizeOptions = [5, 10, 15] as const;
export type DigestTargetSize = (typeof digestSizeOptions)[number];

export interface SubscriptionPreferences {
  name: string;
  company: string;
  email: string;
  role: SubscriberRole;
  tags: string[];
  frequency: DigestFrequency;
  targetSize: DigestTargetSize;
  consent: true;
}

export const roleLabels: Record<SubscriberRole, string> = {
  supplier: "Поставщик",
  buyer: "Закупщик",
  both: "Закупки и поставки",
};

export const frequencyLabels: Record<DigestFrequency, string> = {
  daily: "Каждый день",
  "twice-weekly": "Два раза в неделю",
  weekly: "Раз в неделю",
  monthly: "Раз в месяц",
};
