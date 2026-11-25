import { test, expect } from "bun:test";
import { automationSchema, nextProspectRun } from "../src/lib/prospect-automation";

test("daily automatic prospecting accepts 1–100 contacts and rejects out-of-range quantities", () => {
  for (const daily_limit of [1, 50, 100]) expect(automationSchema.safeParse({ enabled: false, daily_limit, uf: "" }).success).toBe(true);
  for (const daily_limit of [0, 101, 1.5]) expect(automationSchema.safeParse({ enabled: true, daily_limit, uf: "" }).success).toBe(false);
});

test("next run is 09:17 Brasília and never repeats a completed day", () => {
  expect(nextProspectRun(new Date("2026-11-25T01:35:00Z"), null).toISOString()).toBe("2026-11-25T12:17:00.000Z");
  expect(nextProspectRun(new Date("2026-11-25T01:35:00Z"), "2026-11-24").toISOString()).toBe("2026-11-25T12:17:00.000Z");
  expect(nextProspectRun(new Date("2026-11-25T13:00:00Z"), "2026-11-25").toISOString()).toBe("2026-11-26T12:17:00.000Z");
});

test("state filter is optional and normalizes valid abbreviations", () => {
  expect(automationSchema.parse({ enabled: false, daily_limit: 50, uf: " sp " }).uf).toBe("SP");
  expect(automationSchema.safeParse({ enabled: false, daily_limit: 50, uf: "São Paulo" }).success).toBe(false);
});