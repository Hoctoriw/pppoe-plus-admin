import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

// Aceita o token mestre (instalação manual antiga) ou o token exclusivo de um servidor pareado.
async function authorized(request: Request): Promise<{ ok: boolean; appliance?: string }> {
  const url = new URL(request.url);
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
  if (!given) return { ok: false };
  const expected = process.env["RADIUS_API_TOKEN"];
  if (expected && timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest())) return { ok: true };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const h = sha(given);
  const { data } = await (supabaseAdmin as any).from("radius_appliances").select("hostname").eq("token_hash", h).maybeSingle();
  return data ? { ok: true, appliance: h } : { ok: false };
}

// rlm_rest envia { "User-Name": { "type": "string", "value": ["x"] }, ... }
function attr(body: any, name: string): string {
  const v = body?.[name];
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v?.value?.[0] ?? "");
}

const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export const AGENT_VERSION = "1.1.0";

async function pairing(action: string, body: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  if (action === "pair-request") {
    const hostname = s(body?.hostname, 80).replace(/[^A-Za-z0-9._-]/g, "") || "nexora-radius";
    const { count } = await db.from("radius_pairings").select("code", { count: "exact", head: true }).eq("status", "pending").gt("expires_at", new Date().toISOString());
    if ((count ?? 0) > 50) return new Response("Muitos pedidos pendentes", { status: 429 });
    await db.from("radius_pairings").delete().lt("expires_at", new Date(Date.now() - 3600_000).toISOString());
    const poll = randomBytes(32).toString("hex");
    const expires_at = new Date(Date.now() + 15 * 60_000).toISOString();
    for (let i = 0; i < 5; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const { error } = await db.from("radius_pairings").insert({ code, poll_hash: sha(poll), hostname, local_ip: s(body?.local_ip, 64), expires_at });
      if (!error) return Response.json({ code, poll_secret: poll, expires_at });
    }
    return new Response("Tente novamente", { status: 503 });
  }
  // pair-status
  const code = s(body?.code, 6), poll = s(body?.poll_secret, 64);
  const { data: p } = await db.from("radius_pairings").select("*").eq("code", code).maybeSingle();
  if (!p || p.poll_hash !== sha(poll)) return new Response("Not found", { status: 404 });
  if (p.status === "approved" && p.issued_token) {
    await db.from("radius_pairings").update({ status: "delivered", issued_token: null }).eq("code", code);
    return Response.json({ status: "approved", token: p.issued_token, version: AGENT_VERSION });
  }
  if (p.status === "pending" && new Date(p.expires_at) < new Date()) return Response.json({ status: "expired" });
  return Response.json({ status: p.status });
}

export const Route = createFileRoute("/api/public/radius/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!(await authorized(request)).ok) return new Response("Unauthorized", { status: 403 });
        if (params.action === "version") return Response.json({ version: AGENT_VERSION });
        if (params.action !== "clients") return new Response("Not found", { status: 404 });
        // Lista de roteadores autorizados (clients.conf do FreeRADIUS)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("routers").select("id, base_url, radius_secret").eq("radius_enabled", true);
        const lines: string[] = [];
        for (const r of data ?? []) {
          let host = "";
          try { host = new URL(r.base_url).hostname; } catch { continue; }
          const secret = String(r.radius_secret ?? "").replace(/[^\x21-\x7e]/g, "").replace(/["\\]/g, "");
          if (!host || !secret || !/^[A-Za-z0-9.:-]+$/.test(host)) continue;
          lines.push(`client nx_${r.id.replace(/-/g, "")} {\n  ipaddr = ${host}\n  secret = "${secret}"\n  nas_type = other\n}`);
        }
        return new Response(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain" } });
      },
      POST: async ({ request, params }) => {
        if (params.action === "pair-request" || params.action === "pair-status") {
          return pairing(params.action, await request.json().catch(() => ({})));
        }
        const auth = await authorized(request);
        if (!auth.ok) return new Response("Unauthorized", { status: 403 });
        const body = await request.json().catch(() => ({}));

        if (params.action === "heartbeat") {
          const hostname = s(body?.hostname, 80).replace(/[^A-Za-z0-9._-]/g, "");
          if (!hostname) return new Response("Missing hostname", { status: 400 });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const row = { local_ip: s(body?.local_ip, 64), version: s(body?.version, 20), radius_ok: body?.radius_ok === true, uptime: s(body?.uptime, 80), last_seen_at: new Date().toISOString() };
          if (auth.appliance) await (supabaseAdmin as any).from("radius_appliances").update(row).eq("token_hash", auth.appliance);
          else await (supabaseAdmin as any).from("radius_appliances").upsert({ hostname, ...row });
          return Response.json({ version: AGENT_VERSION });
        }
        if (params.action === "accounting") return new Response(null, { status: 204 });
        if (params.action !== "authorize") return new Response("Not found", { status: 404 });

        const user = attr(body, "User-Name").trim().slice(0, 128);
        if (!user) return new Response("Missing user", { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const cols = "status, technology, pppoe_password, ipoe_ip, plans(upload_mbps, download_mbps)";
        let { data: c } = await supabaseAdmin.from("customers").select(cols).eq("pppoe_username", user).eq("technology", "pppoe").maybeSingle();
        if (!c && MAC.test(user)) {
          ({ data: c } = await supabaseAdmin.from("customers").select(cols).eq("mac_address", user.replace(/-/g, ":").toUpperCase()).eq("technology", "ipoe").maybeSingle());
        }
        if (!c || c.status !== "active") return new Response(JSON.stringify({ "reply:Reply-Message": "Acesso negado" }), { status: 401, headers: { "Content-Type": "application/json" } });

        const out: Record<string, string> = {};
        const p = (c as any).plans;
        if (p) out["reply:Mikrotik-Rate-Limit"] = `${p.upload_mbps}M/${p.download_mbps}M`;
        if (c.technology === "pppoe") out["control:Cleartext-Password"] = c.pppoe_password ?? "";
        else {
          out["control:Auth-Type"] = "Accept";
          if (c.ipoe_ip) out["reply:Framed-IP-Address"] = String(c.ipoe_ip);
        }
        return Response.json(out);
      },
    },
  },
});
