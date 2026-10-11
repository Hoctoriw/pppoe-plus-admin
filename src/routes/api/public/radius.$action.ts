import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function authorized(request: Request) {
  const expected = process.env["RADIUS_API_TOKEN"];
  if (!expected) return false;
  const url = new URL(request.url);
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// rlm_rest envia { "User-Name": { "type": "string", "value": ["x"] }, ... }
function attr(body: any, name: string): string {
  const v = body?.[name];
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v?.value?.[0] ?? "");
}

const MAC = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

export const AGENT_VERSION = "1.0.0";

export const Route = createFileRoute("/api/public/radius/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 403 });
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
        if (!authorized(request)) return new Response("Unauthorized", { status: 403 });
        const body = await request.json().catch(() => ({}));

        if (params.action === "heartbeat") {
          const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
          const hostname = s(body?.hostname, 80).replace(/[^A-Za-z0-9._-]/g, "");
          if (!hostname) return new Response("Missing hostname", { status: 400 });
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await (supabaseAdmin as any).from("radius_appliances").upsert({ hostname, local_ip: s(body?.local_ip, 64), version: s(body?.version, 20), radius_ok: body?.radius_ok === true, uptime: s(body?.uptime, 80), last_seen_at: new Date().toISOString() });
          return Response.json({ version: AGENT_VERSION });
        }
        if (params.action === "accounting") {
          const user = attr(body, "User-Name").trim().slice(0, 128);
          if (user) {
            const n = (k: string) => Number(attr(body, k)) || 0;
            const type = attr(body, "Acct-Status-Type").toLowerCase();
            const inB = n("Acct-Input-Gigawords") * 4294967296 + n("Acct-Input-Octets");
            const outB = n("Acct-Output-Gigawords") * 4294967296 + n("Acct-Output-Octets");
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await (supabaseAdmin as any).from("customers").update({ acct_input_bytes: inB, acct_output_bytes: outB, acct_session_time: n("Acct-Session-Time"), acct_updated_at: new Date().toISOString(), online: type !== "stop" }).eq("pppoe_username", user);
          }
          return new Response(null, { status: 204 });
        }
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
