import { beforeAll, afterAll, test, expect } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as db } from "../src/integrations/supabase/client.server";

let client: SupabaseClient;
const users: string[] = [];
let owner = "", other = "", nodeId = "", ownPlan = "", foreignPlan = "", customerId = "";
function requireData<T>(result: { data: T | null; error: unknown }): T {
 if (result.error || !result.data) throw new Error("Security test fixture failed");
 return result.data;
}
beforeAll(async () => {
 const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
 if (!url || !key) throw new Error("Database integration test environment missing");
 const password = crypto.randomUUID();
 const email = `security-test-${crypto.randomUUID()}@example.com`;
 for (const address of [email, `security-test-${crypto.randomUUID()}@example.com`]) {
  const created = requireData(await db.auth.admin.createUser({ email: address, password, email_confirm: true }));
  if (!created.user) throw new Error("Missing test user");
  users.push(created.user.id);
 }
 owner = users[0] ?? ""; other = users[1] ?? "";
 client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
  const headers = new Headers(init?.headers);
  if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
  headers.set("apikey", key); return fetch(input, { ...init, headers });
 } } });
 const login = await client.auth.signInWithPassword({ email, password });
 if (login.error) throw new Error("Test sign-in failed");
 await db.from("user_roles").upsert({ user_id: owner, role: "operator" }, { onConflict: "user_id,role" });
 const lic = await db.from("licenses").upsert({ user_id: owner, expires_at: new Date(Date.now() + 3600000).toISOString(), has_network: false });
 if (lic.error) throw new Error("License fixture failed");
 nodeId = requireData(await db.from("ftth_nodes").insert({ owner_id: owner, node_type: "olt", name: "security-test", latitude: 0, longitude: 0 }).select("id").single()).id;
 ownPlan = requireData(await db.from("plans").insert({ owner_id: owner, name: "security-test-own", download_mbps: 100, upload_mbps: 50, monthly_price: 100 }).select("id").single()).id;
 foreignPlan = requireData(await db.from("plans").insert({ owner_id: other, name: "security-test-foreign", download_mbps: 500, upload_mbps: 250, monthly_price: 200 }).select("id").single()).id;
 customerId = requireData(await db.from("customers").insert({ owner_id: owner, created_by: owner, full_name: "security-test", document: crypto.randomUUID(), phone: "000", technology: "pppoe", pppoe_username: `test-${owner}`, plan_id: ownPlan }).select("id").single()).id;
}, 30000);

afterAll(async () => {
 for (const id of users) {
  await db.from("customers").delete().eq("owner_id", id);
  await db.from("ftth_nodes").delete().eq("owner_id", id);
  await db.from("plans").delete().eq("owner_id", id);
  await db.from("licenses").delete().eq("user_id", id);
  const removed = await db.auth.admin.deleteUser(id);
  if (removed.error) throw new Error("Test user cleanup failed");
 }
}, 30000);

test("ordinary accounts can check their own role but not another account's", async () => {
 const foreign = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).single();
 if (!foreign.data) throw new Error("Expected platform admin fixture");
 const own = await client.rpc("has_role", { _user_id: owner, _role: "operator" });
 const cross = await client.rpc("has_role", { _user_id: foreign.data.user_id, _role: "admin" });
 expect(own.error).toBeNull(); expect(own.data).toBe(true);
 expect(cross.error).toBeNull(); expect(cross.data).toBe(false);
});

test("FTTH direct reads and writes require an active add-on", async () => {
 const hidden = await client.from("ftth_nodes").select("id").eq("id", nodeId);
 expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
 const rejected = await client.from("ftth_nodes").insert({ owner_id: owner, node_type: "olt", name: "blocked-test", latitude: 0, longitude: 0 });
 expect(rejected.error?.code).toBe("42501");
 await db.from("licenses").update({ has_network: true }).eq("user_id", owner);
 const licensed = await client.from("ftth_nodes").select("id").eq("id", nodeId);
 expect(licensed.data).toEqual([{ id: nodeId }]);
 await db.from("licenses").update({ expires_at: new Date(Date.now() - 3600000).toISOString() }).eq("user_id", owner);
 const expired = await client.from("ftth_nodes").select("id").eq("id", nodeId);
 expect(expired.error).toBeNull(); expect(expired.data).toEqual([]);
});

test("customer writes reject another tenant's plan and keep the original", async () => {
 const rejected = await client.from("customers").update({ plan_id: foreignPlan }).eq("id", customerId);
 expect(rejected.error?.code).toBe("23514");
 const unchanged = await client.from("customers").select("plan_id").eq("id", customerId).single();
 expect(unchanged.data?.plan_id).toBe(ownPlan);
});
