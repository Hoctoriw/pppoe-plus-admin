import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes, randomInt } from "crypto";
import { z } from "zod";

// O painel local (on-premise) chama isto para pedir um código de pareamento de 6 dígitos.
// O dono digita o código na página Backup do painel online para autorizar.

const bodySchema = z.object({
  hostname: z.string().max(120).optional(),
  local_ip: z.string().max(60).optional(),
});

export const Route = createFileRoute("/api/public/onprem/pair-request")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown = {};
        try { body = await request.json(); } catch { /* corpo vazio é aceito */ }
        const parsed = bodySchema.safeParse(body ?? {});
        if (!parsed.success) return new Response("Dados inválidos", { status: 400 });

        const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const poll_secret = randomBytes(24).toString("hex");
        const poll_hash = createHash("sha256").update(poll_secret).digest("hex");
        const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        // Limpa pedidos antigos (mais de 1 hora) para a tabela não crescer sem fim.
        await db.from("onprem_pairings").delete().lt("expires_at", new Date(Date.now() - 3_600_000).toISOString());
        const { error } = await db.from("onprem_pairings").insert({
          code,
          poll_hash,
          hostname: parsed.data.hostname ?? null,
          local_ip: parsed.data.local_ip ?? null,
          expires_at,
        });
        if (error) return new Response("Erro ao gerar código", { status: 500 });
        return new Response(JSON.stringify({ code, poll_secret, expires_at }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
