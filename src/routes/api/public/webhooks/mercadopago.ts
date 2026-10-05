import { createFileRoute } from "@tanstack/react-router";

// Aviso do Mercado Pago para pagamentos de licença.
// Segurança: o corpo nunca é confiado — a situação é sempre consultada na API
// do Mercado Pago com o Access Token da plataforma antes de liberar a licença.
async function handle(request: Request) {
  const url = new URL(request.url);
  let body: any = {};
  try { body = await request.json(); } catch { /* aviso por query string */ }
  const type = body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const rawId = body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const paymentId = rawId != null ? String(rawId) : "";
  if (type !== "payment" || !/^\d{1,30}$/.test(paymentId)) return new Response("ignored", { status: 200 });

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: lp } = await db.from("license_payments").select("*").eq("provider_charge_id", paymentId).eq("status", "pending").maybeSingle();
  if (!lp) return new Response("ok", { status: 200 });
  const { data: s } = await db.from("license_settings").select("api_key, environment, active, provider").eq("id", 1).maybeSingle();
  if (!s?.api_key || s.provider !== "mercadopago") return new Response("ok", { status: 200 });
  const { licensePixStatus } = await import("@/lib/billing.server");
  const { approveLicensePaymentRow } = await import("@/lib/users.functions");
  try {
    const st = await licensePixStatus(s as never, paymentId);
    if (st === "RECEIVED") await approveLicensePaymentRow(db, lp);
  } catch {
    return new Response("provider check failed", { status: 502 });
  }
  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
