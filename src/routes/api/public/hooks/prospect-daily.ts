import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/prospect-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: runs, error } = await db.rpc("claim_prospect_automation");
        if (error) throw new Error(error.message);
        const settings = runs?.[0];
        if (!settings) return Response.json({ skipped: true });
        const { deliverProspects } = await import("@/lib/prospect-delivery.server");
        try {
          const result = await deliverProspects(db, { limit: settings.daily_limit, ...(settings.uf ? { uf: settings.uf } : {}) });
          const { error: saveError } = await db.from("prospect_automation").update({ last_sent: result.sent, last_failed: result.failed, last_error: result.lastError || null }).eq("id", 1);
          if (saveError) throw new Error(saveError.message);
          return Response.json({ sent: result.sent, failed: result.failed });
        } catch (e) {
          await db.from("prospect_automation").update({ last_error: e instanceof Error ? e.message : "Falha no envio automático" }).eq("id", 1);
          return Response.json({ error: "Falha no envio automático; consulte a aba Automático." }, { status: 500 });
        }
      },
    },
  },
});