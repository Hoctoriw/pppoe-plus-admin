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

export const Route = createFileRoute("/api/public/radius/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!authorized(request)) return new Response("Unauthorized", { status: 403 });
        const body = await request.json().catch(() => ({}));

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
