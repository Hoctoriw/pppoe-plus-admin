import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";

// O servidor local consulta este endpoint com o código + segredo do pedido.
// Enquanto o dono não aprovar, responde "pending". Depois de aprovado,
// devolve a chave de sincronismo UMA vez e marca como entregue.

const bodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
  poll_secret: z.string().regex(/^[a-f0-9]{48}$/),
});

export const Route = createFileRoute("/api/public/onprem/pair-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return new Response("Dados inválidos", { status: 400 }); }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return new Response("Dados inválidos", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data: p } = await db.from("onprem_pairings").select("*").eq("code", parsed.data.code).maybeSingle();
        if (!p) return new Response(JSON.stringify({ status: "invalid" }), { headers: { "content-type": "application/json" } });

        const expected = Buffer.from(String(p.poll_hash), "hex");
        const got = Buffer.from(createHash("sha256").update(parsed.data.poll_secret).digest("hex"), "hex");
        if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
          return new Response(JSON.stringify({ status: "invalid" }), { headers: { "content-type": "application/json" } });
        }
        if (new Date(p.expires_at) < new Date()) {
          return new Response(JSON.stringify({ status: "expired" }), { headers: { "content-type": "application/json" } });
        }
        if (p.status === "pending") {
          return new Response(JSON.stringify({ status: "pending" }), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
        }
        if (p.status === "delivered" || !p.issued_token) {
          return new Response(JSON.stringify({ status: "delivered" }), { headers: { "content-type": "application/json" } });
        }
        await db.from("onprem_pairings").update({ status: "delivered" }).eq("code", parsed.data.code);
        return new Response(JSON.stringify({ status: "approved", token: p.issued_token }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
