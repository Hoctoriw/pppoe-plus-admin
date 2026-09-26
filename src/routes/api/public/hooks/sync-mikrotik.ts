import { createFileRoute } from "@tanstack/react-router";
import { BLOCK_PROFILE, profileName, provisionOne, upsert } from "@/lib/mikrotik.server";

async function authorized(request: Request): Promise<boolean> {
  const expected = process.env["SYNC_CRON_TOKEN"];
  if (!expected) return false;
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(d(token), d(expected));
}

// Sincronismo automático: reprovisiona todos os clientes em seus roteadores.
// Chamado a cada hora pelo agendador do banco (pg_cron), autenticado por LOVABLE_CRON_SECRET.
export const Route = createFileRoute("/api/public/hooks/sync-mikrotik")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        const { data: routers } = await db.from("routers").select("*").eq("active", true);
        const routerMap = new Map((routers ?? []).map((r: any) => [r.id, r]));

        const { data: customers } = await db
          .from("customers")
          .select("*, plans(*)")
          .not("router_id", "is", null)
          .neq("status", "cancelled");

        let synced = 0;
        const errors: { customer: string; error: string }[] = [];

        // Garante os perfis de velocidade em cada roteador antes de provisionar
        const { data: plans } = await db.from("plans").select("*").eq("status", "active");
        for (const r of routerMap.values()) {
          try {
            await upsert(r, "/ppp/profile", { name: BLOCK_PROFILE }, { "rate-limit": "1M/1M", "address-list": "nexora_bloqueados", comment: "Nexora: clientes suspensos" });
            for (const p of plans ?? []) {
              await upsert(r, "/ppp/profile", { name: profileName(p.name) }, { "rate-limit": `${p.upload_mbps}M/${p.download_mbps}M`, comment: `Nexora: ${p.name}` });
            }
          } catch (e) {
            errors.push({ customer: `(roteador ${r.name})`, error: e instanceof Error ? e.message : String(e) });
          }
        }

        for (const c of customers ?? []) {
          const r = routerMap.get(c.router_id);
          if (!r) continue;
          const res = await provisionOne(db, c, r);
          if (res.ok) synced++;
          else errors.push({ customer: c.full_name, error: res.error ?? "erro desconhecido" });
        }

        return new Response(
          JSON.stringify({ success: true, synced, failed: errors.length, errors: errors.slice(0, 20), timestamp: new Date().toISOString() }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
