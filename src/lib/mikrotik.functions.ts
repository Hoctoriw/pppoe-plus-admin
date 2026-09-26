import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BLOCK_LIST, BLOCK_PROFILE, profileName, provisionOne, ros, upsert } from "./mikrotik.server";

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
    const { data } = await db.from("routers").select("id, name, connection_mode, base_url, username, dhcp_server, active, last_check_at, last_check_ok, last_check_message, radius_enabled, radius_host, radius_auth_port, radius_acct_port").order("name");
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
    connection_mode: z.enum(["vpn", "public_ip"]).default("vpn"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const row: any = { name: data.name, base_url: data.base_url, username: data.username, dhcp_server: data.dhcp_server || null, connection_mode: data.connection_mode };
    if (data.password) row["password"] = data.password;
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

export const saveRadiusConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    radius_enabled: z.boolean(),
    radius_host: z.string().max(200).optional(),
    radius_secret: z.string().max(200).optional(),
    radius_auth_port: z.number().int().min(1).max(65535).default(1812),
    radius_acct_port: z.number().int().min(1).max(65535).default(1813),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.radius_enabled && !data.radius_host) throw new Error("Informe o endereço do servidor RADIUS.");
    const db = await admin();
    const row: any = { radius_enabled: data.radius_enabled, radius_host: data.radius_host || null, radius_auth_port: data.radius_auth_port, radius_acct_port: data.radius_acct_port };
    if (data.radius_secret) row["radius_secret"] = data.radius_secret;
    const { error } = await db.from("routers").update(row).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyRadius = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await getRouter(data.id);
    if (!(r as any).radius_enabled) throw new Error("Ative e salve a configuração RADIUS antes de aplicar.");
    if (!(r as any).radius_host || !(r as any).radius_secret) throw new Error("Configure o endereço e o segredo do servidor RADIUS.");
    await upsert(r, "/radius", { name: "nexora-radius" }, {
      address: (r as any).radius_host,
      secret: (r as any).radius_secret,
      "authentication-port": String((r as any).radius_auth_port ?? 1812),
      "accounting-port": String((r as any).radius_acct_port ?? 1813),
      service: "ppp,dhcp", timeout: "3000ms", comment: "Nexora: autenticação centralizada",
    });
    await ros(r, "PATCH", "/ppp/aaa", { "use-radius": "yes", accounting: "yes", "interim-update": "5m" });
    return { ok: true };
  });

export const testRadius = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const r = await getRouter(data.id);
    if (!(r as any).radius_enabled || !(r as any).radius_host) throw new Error("Ative e salve a configuração RADIUS antes de testar.");
    const host = (r as any).radius_host as string;
    const authPort = String((r as any).radius_auth_port ?? 1812);
    const acctPort = String((r as any).radius_acct_port ?? 1813);
    const checks: { label: string; ok: boolean; detail: string }[] = [];

    // 1. Router -> FreeRADIUS reachability (ping executed on the router via REST)
    try {
      const pings = await ros<any[]>(r, "POST", "/ping", { address: host, count: "3" });
      const last = pings?.[pings.length - 1] ?? {};
      const loss = Number(last["packet-loss"] ?? 100);
      checks.push({
        label: "Comunicação roteador → FreeRADIUS",
        ok: loss < 100,
        detail: loss < 100 ? `resposta em ${last["avg-rtt"] ?? last["time"] ?? "?"} · perda ${loss}%` : "sem resposta — verifique firewall, rotas e se o FreeRADIUS está no ar",
      });
    } catch (e) {
      checks.push({ label: "Comunicação roteador → FreeRADIUS", ok: false, detail: e instanceof Error ? e.message : String(e) });
    }

    // 2. RADIUS entry applied on the router
    let entry: any = null;
    try {
      const rad = await ros<any[]>(r, "GET", "/radius?name=nexora-radius");
      entry = rad?.[0] ?? null;
    } catch { /* reported below */ }
    checks.push({
      label: "Servidor RADIUS configurado no roteador",
      ok: !!entry,
      detail: entry ? `${entry.address} · auth ${entry["authentication-port"]} · acct ${entry["accounting-port"]}` : "entrada nexora-radius não encontrada — clique em Aplicar no roteador",
    });
    if (entry) {
      const authOk = entry.address === host && String(entry["authentication-port"]) === authPort;
      checks.push({
        label: "Autenticação (porta " + authPort + ")",
        ok: authOk,
        detail: authOk ? "endereço e porta conferem com o painel" : `roteador aponta para ${entry.address}:${entry["authentication-port"]} — salve e aplique novamente`,
      });
      const acctOk = String(entry["accounting-port"]) === acctPort;
      checks.push({
        label: "Accounting (porta " + acctPort + ")",
        ok: acctOk,
        detail: acctOk ? "porta de contabilidade confere com o painel" : `roteador usa a porta ${entry["accounting-port"]} — salve e aplique novamente`,
      });
    }

    // 3. PPP AAA using RADIUS for auth + accounting
    let aaa: any = null;
    try { aaa = await ros<any>(r, "GET", "/ppp/aaa"); } catch { /* reported below */ }
    checks.push({
      label: "Autenticação PPP delegada ao RADIUS",
      ok: aaa?.["use-radius"] === "yes",
      detail: aaa?.["use-radius"] === "yes" ? "use-radius ativado" : "use-radius desativado — clique em Aplicar no roteador",
    });
    checks.push({
      label: "Accounting PPP ativado",
      ok: aaa?.accounting === "yes",
      detail: aaa?.accounting === "yes" ? `accounting ativado · interim-update ${aaa?.["interim-update"] ?? "—"}` : "accounting desativado — clique em Aplicar no roteador",
    });

    return { ok: checks.every((c) => c.ok), checks };
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
    return provisionOne(db, c, r);
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

export const getRadiusInstall = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return { token: process.env["RADIUS_API_TOKEN"] ?? "" };
  });
