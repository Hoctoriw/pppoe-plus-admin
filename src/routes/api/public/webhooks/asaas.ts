import { createFileRoute } from "@tanstack/react-router";
import { fetchBoleto, type BankAccount } from "@/lib/billing.server";

// Webhook do Asaas para baixa automática de boletos.
// Segurança: o corpo do aviso nunca é confiado diretamente — a situação da
// cobrança é sempre confirmada na API do provedor antes de baixar.
export const Route = createFileRoute("/api/public/webhooks/asaas")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const event = payload?.event as string | undefined;
        const paymentId = payload?.payment?.id as string | undefined;
        if (!event || !paymentId) return new Response("ignored", { status: 200 });
        if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "PAYMENT_DELETED"].includes(event)) {
          return new Response("ignored", { status: 200 });
        }

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: invoice } = await db
          .from("invoices")
          .select("id, status, bank_account_id, provider_charge_id")
          .eq("provider_charge_id", paymentId)
          .maybeSingle();
        if (!invoice) {
          // Pode ser um pagamento de licença do painel.
          const { data: lp } = await db.from("license_payments").select("*").eq("provider_charge_id", paymentId).eq("status", "pending").maybeSingle();
          if (!lp) return new Response("ok", { status: 200 });
          const { data: s } = await db.from("license_settings").select("api_key, environment, active, provider").eq("id", 1).maybeSingle();
          if (!s?.api_key) return new Response("ok", { status: 200 });
          const { licensePixStatus } = await import("@/lib/billing.server");
          const { approveLicensePaymentRow } = await import("@/lib/users.functions");
          try {
            const st = await licensePixStatus(s as never, paymentId);
            if (st === "RECEIVED" || st === "CONFIRMED") await approveLicensePaymentRow(db, lp);
          } catch {
            return new Response("provider check failed", { status: 502 });
          }
          return new Response("ok", { status: 200 });
        }
        if (!invoice.bank_account_id) return new Response("ok", { status: 200 });

        const { data: account } = await db
          .from("bank_accounts")
          .select("*")
          .eq("id", invoice.bank_account_id)
          .single();
        if (!account?.api_key) return new Response("ok", { status: 200 });

        // Confirma a situação real na API do provedor.
        let info;
        try {
          info = await fetchBoleto(account as BankAccount, paymentId);
        } catch {
          return new Response("provider check failed", { status: 502 });
        }

        const patch: Record<string, string> = {};
        if (info.status === "RECEIVED" || info.status === "CONFIRMED") {
          patch["status"] = "paid";
          patch["boleto_status"] = "paid";
          patch["paid_at"] = new Date().toISOString().slice(0, 10);
          patch["method"] = "boleto";
        } else if (info.status === "OVERDUE" && invoice.status === "open") {
          patch["status"] = "overdue";
        } else if (info.status === "DELETED" || info.status === "REFUNDED") {
          patch["boleto_status"] = "cancelled";
        }
        if (Object.keys(patch).length) {
          await db.from("invoices").update(patch as never).eq("id", invoice.id);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
