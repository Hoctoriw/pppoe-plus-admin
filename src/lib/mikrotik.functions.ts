import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BLOCK_LIST, BLOCK_PROFILE, profileName, removeWhere, ros, upsert } from "./mikrotik.server";

type Ctx = { supabase: any; userId: string };

async function assertStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("can_manage_network");
  if (!data) throw new Error("Sem permissão para operar a rede.");
}
async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores podem gerenciar roteadores.");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function getRouter(id: string) {
  const db = await admin();
  const { data, error } = await db.from("routers").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Roteador não encontrado.");
  return data;
}

export const listRouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data } = await db.from("routers").select("id, name, base_url, username, dhcp_server, active, last_check_at, last_check_ok, last_check_message").order("name");
    return data ?? [];
  });

export const saveRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    base_url: z.string().url().max(200),
    username: z.string().min(1).max(80),
    password: z.string().max(200).optional(),
    dhcp_server: z.string().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const row: Record<string, unknown> = { name: data.name, base_url: data.base_url, username: data.username, dhcp_server: data.dhcp_server || null };
    if (data.password) row.password = data.password;
    if (data.id) { const { error } = await db.from("routers").update(row).eq("id", data.id); if (error) throw new Error(error.message); }
    else { if (!data.password) throw new Error("Informe a senha."); const { error } = await db.from("routers").insert(row as any); if (error) throw new Error(error.message); }
    return { ok: true };
  });

export const deleteRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (await admin()).from("routers").delete().eq("id", data.id);
    return { ok: true };
  });

export const testRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await getRouter(data.id);
    let ok = true, message: string;
    try {
      const id = await ros<any>(r, "GET", "/system/identity");
      const res = await ros<any>(r, "GET", "/system/resource");
      message = `${id?.name ?? "RouterOS"} · v${res?.version} · uptime ${res?.uptime}`;
    } catch (e) { ok = false; message = e instanceof Error ? e.message : String(e); }
    await (await admin()).from("routers").update({ last_check_at: new Date().toISOString(), last_check_ok: ok, last_check_message: message }).eq("id", data.id);
    return { ok, message };
  });

export const syncPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await getRouter(data.id);
    const db = await admin();
    const { data: plans } = await db.from("plans").select("*").eq("status", "active");
    await upsert(r, "/ppp/profile", { name: BLOCK_PROFILE }, { "rate-limit": "1M/1M", "address-list": BLOCK_LIST, comment: "Nexora: clientes suspensos" });
    for (const p of plans ?? []) {
      await upsert(r, "/ppp/profile", { name: profileName(p.name) }, { "rate-limit": `${p.upload_mbps}M/${p.download_mbps}M`, comment: `Nexora: ${p.name}` });
    }
    return { count: plans?.length ?? 0 };
  });

export const provisionCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const db = await admin();
    const { data: c } = await db.from("customers").select("*, plans(*)").eq("id", data.id).single();
    if (!c) throw new Error("Cliente não encontrado.");
    if (!c.router_id) throw new Error("Vincule um roteador ao cliente.");
    const r = await getRouter(c.router_id);
    const plan = (c as any).plans;
    const suspended = c.status === "suspended";
    const disabled = c.status === "cancelled" ? "yes" : "no";
    const tag = `nexora:${c.id}`;
    try {
      if (c.technology === "pppoe") {
        if (!plan) throw new Error("Cliente sem plano.");
        await upsert(r, "/ppp/secret", { name: c.pppoe_username! }, {
          password: c.pppoe_password ?? "", service: "pppoe", disabled, comment: `${tag} ${c.full_name}`,
          profile: suspended ? BLOCK_PROFILE : profileName(plan.name),
        });
        // Drop active session so the new profile applies
        const act = await ros<any[]>(r, "GET", `/ppp/active?name=${encodeURIComponent(c.pppoe_username!)}`);
        for (const a of act ?? []) await ros(r, "DELETE", `/ppp/active/${encodeURIComponent(a[".id"])}`);
      } else {
        const ip = String(c.ipoe_ip);
        if (!c.mac_address) throw new Error("Informe o MAC do cliente IPoE.");
        await upsert(r, "/ip/dhcp-server/lease", { "mac-address": String(c.mac_address).toUpperCase() }, {
          address: ip, disabled, comment: `${tag} ${c.full_name}`, ...(r.dhcp_server ? { server: r.dhcp_server } : {}),
        });
        if (plan) {
          await upsert(r, "/queue/simple", { name: `nexora-${c.id.slice(0, 8)}` }, {
            target: `${ip}/32`, "max-limit": suspended ? "1M/1M" : `${plan.upload_mbps}M/${plan.download_mbps}M`, comment: tag,
          });
        }
        if (suspended) await upsert(r, "/ip/firewall/address-list", { list: BLOCK_LIST, address: ip }, { comment: tag });
        else await removeWhere(r, "/ip/firewall/address-list", { list: BLOCK_LIST, address: ip });
      }
      await db.from("customers").update({ sync_status: "synced", last_sync_at: new Date().toISOString(), sync_error: null }).eq("id", c.id);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("customers").update({ sync_status: "error", sync_error: msg }).eq("id", c.id);
      return { ok: false, error: msg };
    }
  });

export const connectionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await getRouter(data.id);
    try {
      const [ppp, leases] = await Promise.all([
        ros<any[]>(r, "GET", "/ppp/active"),
        ros<any[]>(r, "GET", "/ip/dhcp-server/lease"),
      ]);
      return {
        error: null as string | null,
        pppoe: (ppp ?? []).map((a) => ({ name: a.name as string, address: a.address as string, uptime: a.uptime as string, caller: a["caller-id"] as string })),
        ipoe: (leases ?? []).filter((l) => l.status === "bound").map((l) => ({ address: l.address as string, mac: l["mac-address"] as string, host: (l["host-name"] ?? "") as string, lastSeen: (l["last-seen"] ?? "") as string })),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), pppoe: [], ipoe: [] };
    }
  });
