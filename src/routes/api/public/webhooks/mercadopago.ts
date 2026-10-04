import { createFileRoute } from "@tanstack/react-router";

// Aviso do Mercado Pago para licenças. Nunca confia no corpo: confirma o
// status do pagamento direto na API do Mercado Pago antes de liberar.
export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let payload: any = {};
        try { payload = await request.json(); } catch { /* aviso pode vir só na query */ }
        const id = String(payload?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");
        if (!/^\d{1,30}$/.test(id)) return new Response("ignored", { status: 200 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: lp } = await db.from("license_payments").select("*").eq("provider_charge_id", id).eq("status", "pending").maybeSingle();
        if (!lp) return new Response("ok", { status: 200 });
        const { data: s } = await db.from("license_settings").select("api_key, environment, active").eq("id", 1).maybeSingle();
        if (!s?.api_key) return new Response("ok", { status: 200 });
        const { licensePixStatus } = await import("@/lib/billing.server");
        const { approveLicensePaymentRow } = await import("@/lib/users.functions");
        try {
          const st = await licensePixStatus(s as never, id);
          if (st === "RECEIVED") await approveLicensePaymentRow(db, lp);
        } catch {
          return new Response("provider check failed", { status: 502 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
