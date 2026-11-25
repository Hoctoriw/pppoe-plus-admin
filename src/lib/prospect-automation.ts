import { z } from "zod";

export const automationSchema = z.object({
  enabled: z.boolean(),
  daily_limit: z.number().int().min(1).max(100),
  uf: z.string().trim().toUpperCase().regex(/^$|^[A-Z]{2}$/),
});

export function nextProspectRun(now: Date, lastRunDay: string | null) {
  // The daily managed callback runs at 12:17 UTC (09:17 Brasília).
  const next = new Date(now);
  next.setUTCHours(12, 17, 0, 0);
  const scheduledDay = new Date(next.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  if (next <= now || lastRunDay === scheduledDay) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}