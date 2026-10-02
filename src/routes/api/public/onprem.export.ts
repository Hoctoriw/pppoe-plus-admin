import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";

// Exporta os dados de UMA conta para o servidor local (on-premise) que tem a chave dela.
const TABLES: Record<string, string> = {
  plans: "*",
  routers: "id,name,base_url,username,dhcp_server,connection_mode,active,radius_enabled,radius_host,radius_auth_port,radius_acct_port,created_at",
  bank_accounts: "id,name,bank_code,agency,agency_digit,account_number,account_digit,wallet,convenio,provider,environment,active,created_at",
  ftth_nodes: "*",
  customers: "*",
  customer_equipment: "*",
  invoices: "*",
};

export const Route = createFileRoute("/api/public/onprem/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!/^nxs_[a-f0-9]{64}$/.test(token)) return new Response("Unauthorized", { status: 401 });
        const hash = createHash("sha256").update(token).digest("hex");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data: row } = await db.from("onprem_sync_tokens").select("owner_id").eq("token_hash", hash).maybeSingle();
        if (!row) return new Response("Unauthorized", { status: 401 });
        const out: Record<string, unknown> = { generated_at: new Date().toISOString() };
        for (const [t, cols] of Object.entries(TABLES)) {
          const { data, error } = await db.from(t).select(cols).eq("owner_id", row.owner_id);
          if (error) return new Response(`Erro em ${t}`, { status: 500 });
          out[t] = data ?? [];
        }
        await db.from("onprem_sync_tokens").update({ last_used_at: new Date().toISOString() }).eq("owner_id", row.owner_id);
        return new Response(JSON.stringify(out), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
      },
    },
  },
});
