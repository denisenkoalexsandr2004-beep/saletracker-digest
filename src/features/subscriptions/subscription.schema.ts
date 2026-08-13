import { z } from "zod";

import {
  frequencies,
  roles,
} from "@/features/subscriptions/subscription.types";
import { digestTags } from "@/features/subscriptions/subscription.categories";

export const subscriptionSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(80),
  company: z.string().trim().min(2, "Укажите компанию").max(120),
  email: z.string().trim().email("Проверьте email"),
  role: z.enum(roles),
  tags: z
    .array(z.enum(digestTags))
    .min(1, "Выберите хотя бы один тег")
    .max(20, "Можно выбрать не более 20 тем")
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Темы не должны повторяться",
    }),
  frequency: z.enum(frequencies),
  targetSize: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  consent: z.literal(true, {
    error: "Нужно согласие на обработку данных",
  }),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;
