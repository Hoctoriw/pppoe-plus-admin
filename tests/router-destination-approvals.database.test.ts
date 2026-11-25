import { afterAll, beforeAll, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as db } from "../src/integrations/supabase/client.server";
import { approvedRouterDestination } from "../src/lib/router-destination-guards";

let client: SupabaseClient, owner = "", routerId = "";
const destination = "https://approval-test.example.com";
beforeAll(async () => {
  const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Missing database test environment");
  const email = `router-security-${crypto.randomUUID()}@example.com`, password = crypto.randomUUID();
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("Test user creation failed");
  owner = created.data.user.id;
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key); return fetch(input, { ...init, headers });
  } } });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("Test sign-in failed");
  const inserted = await db.from("routers").insert({ owner_id: owner, name: "approval-security-test", base_url: destination, username: "test", password, via_agent: false }).select("id").single();
  if (inserted.error || !inserted.data) throw new Error("Router fixture failed");
  routerId = inserted.data.id;
}, 30000);
afterAll(async () => {
  if (routerId) await db.from("routers").delete().eq("id", routerId).eq("owner_id", owner);
  if (owner) await db.auth.admin.deleteUser(owner);
}, 30000);

test("ordinary users cannot grant themselves destination approval", async () => {
  const inserted = await client.from("router_destination_approvals").insert({ router_id: routerId, owner_id: owner, base_url: destination, approved_by: owner });
  expect(inserted.error?.code).toBe("42501");
  await expect(approvedRouterDestination(db, { id: routerId, owner_id: owner, base_url: destination })).rejects.toThrow("não aprovado");
});
test("stored approvals are tenant scoped and revocable", async () => {
  const master = await db.from("user_roles").select("user_id").eq("role", "admin").limit(1).single();
  if (!master.data) throw new Error("Missing master fixture");
  const approval = await db.from("router_destination_approvals").insert({ router_id: routerId, owner_id: owner, base_url: destination, approved_by: master.data.user_id });
  expect(approval.error).toBeNull();
  expect(await approvedRouterDestination(db, { id: routerId, owner_id: owner, base_url: destination })).toBe(destination);
  const hidden = await client.from("router_destination_approvals").select("router_id");
  expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
  await client.from("router_destination_approvals").update({ base_url: "https://other.example.com" }).eq("router_id", routerId);
  const unchanged = await db.from("router_destination_approvals").select("base_url").eq("router_id", routerId).single();
  expect(unchanged.data?.base_url).toBe(destination);
  await expect(approvedRouterDestination(db, { id: routerId, owner_id: master.data.user_id, base_url: destination })).rejects.toThrow("não aprovado");
  await db.from("router_destination_approvals").delete().eq("router_id", routerId);
  await expect(approvedRouterDestination(db, { id: routerId, owner_id: owner, base_url: destination })).rejects.toThrow("não aprovado");
});