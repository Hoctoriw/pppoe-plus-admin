import { test, expect } from "bun:test";
import { cleanupOwnerCommands, customerOwnedPlan } from "../src/lib/tenant-network-guards";

 test("agent cleanup never deletes another owner's expired commands", async () => {
  const now = Date.parse("2026-11-25T01:00:00Z");
  let rows = [
    { id: "old-a", owner_id: "a", created_at: "2026-11-25T00:57:59Z" },
    { id: "old-b", owner_id: "b", created_at: "2026-11-25T00:57:59Z" },
    { id: "recent-a", owner_id: "a", created_at: "2026-11-25T00:59:00Z" },
  ];
  const db = { from: (table: string) => {
    expect(table).toBe("router_commands");
    return { delete: () => ({ eq: (column: string, owner: string) => {
      expect(column).toBe("owner_id");
      return { lt: async (dateColumn: string, cutoff: string) => {
        expect(dateColumn).toBe("created_at");
        rows = rows.filter((r) => r.owner_id !== owner || Date.parse(r.created_at) >= Date.parse(cutoff));
      } };
    } }) };
  } };
  await cleanupOwnerCommands(db, "a", now);
  expect(rows.map((r) => r.id)).toEqual(["old-b", "recent-a"]);
 });

function database() {
 const plans = [{ id: "plan-a", owner_id: "a", download_mbps: 100 }, { id: "plan-b", owner_id: "b", download_mbps: 500 }];
 return { from: () => ({ select: () => {
  const filters: [string, string][] = [];
  const query = { eq: (key: string, value: string) => { filters.push([key, value]); return query; }, maybeSingle: async () => ({ data: plans.find((p) => filters.every(([k,v]) => p[k as keyof typeof p] === v)) ?? null, error: null }) };
  return query;
 } }) };
}

test("provisioning rejects a plan owned by another tenant", async () => {
 await expect(customerOwnedPlan(database(), { owner_id: "a", plan_id: "plan-b" })).rejects.toThrow("Plano não encontrado nesta conta.");
});

test("provisioning keeps the customer's own plan unchanged", async () => {
 expect(await customerOwnedPlan(database(), { owner_id: "a", plan_id: "plan-a" })).toEqual({ id: "plan-a", owner_id: "a", download_mbps: 100 });
});
