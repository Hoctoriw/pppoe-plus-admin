import { test, expect } from "bun:test";
import { recordApplianceHeartbeat, visibleAppliances, type ApplianceIdentity } from "../src/lib/radius-appliance-registry";

const legacy: ApplianceIdentity = { id: "old", owner_id: "owner-a", hostname: "nexora-radius", machine_id: "", local_ip: "192.168.1.2" };
const current: ApplianceIdentity = { ...legacy, id: "new", machine_id: "machine-a" };

function database(initial: ApplianceIdentity[]) {
  let rows = [...initial];
  return {
    rows: () => rows,
    from: () => ({
      upsert: async (row: Omit<ApplianceIdentity, "id">) => {
        const existing = rows.find(r => r.owner_id === row.owner_id && r.hostname === row.hostname && r.machine_id === row.machine_id);
        if (existing) Object.assign(existing, row);
        else rows.push({ ...row, id: "new" });
        return { error: null };
      },
      delete: () => {
        const filters: [string, unknown][] = [];
        const query = {
          eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
          then: (resolve: (value: { error: null }) => unknown) => {
            rows = rows.filter(row => !filters.every(([key, value]) => row[key as keyof ApplianceIdentity] === value));
            return Promise.resolve(resolve({ error: null }));
          },
        };
        return query;
      },
    }),
  };
}

test("an agent upgrade leaves one entry, including repeated heartbeats", async () => {
  const db = database([legacy]);
  await recordApplianceHeartbeat(db, current);
  await recordApplianceHeartbeat(db, current);
  expect(db.rows().map(r => r.machine_id)).toEqual(["machine-a"]);
});

test("cleanup preserves other owners and different local servers with the same hostname", async () => {
  const otherOwner = { ...legacy, id: "other-owner", owner_id: "owner-b" };
  const otherServer = { ...legacy, id: "other-server", local_ip: "192.168.1.3" };
  const db = database([legacy, otherOwner, otherServer]);
  await recordApplianceHeartbeat(db, current);
  expect(db.rows().map(r => r.id).sort()).toEqual(["new", "other-owner", "other-server"]);
});

test("existing duplicates are hidden in the shared appliance list", () => {
  expect(visibleAppliances([legacy, current]).map(r => r.id)).toEqual(["new"]);
});

test("legacy-only servers and unidentified addresses remain visible", async () => {
  const unknown = { ...current, local_ip: "" };
  expect(visibleAppliances([legacy, unknown])).toHaveLength(2);
  const db = database([legacy]);
  await recordApplianceHeartbeat(db, unknown);
  expect(db.rows()).toHaveLength(2);
});