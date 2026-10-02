import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

// O servidor local envia e-mail + senha da conta da nuvem. Se a senha conferir e a conta
// for dona do painel, devolve uma chave de sincronismo nova (substitui a anterior).
const bodySchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/onprem/cloud-login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "Dados inválidos" }, 400); }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return json({ error: "Dados inválidos" }, 400);

        const anon = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: auth, error } = await anon.auth.signInWithPassword(parsed.data);
        if (error || !auth.user) return json({ error: "E-mail ou senha da nuvem inválidos." }, 401);
        const user = auth.user;
        await anon.auth.signOut().catch(() => {});

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data: roles } = await db.from("user_roles").select("owner_id").eq("user_id", user.id);
        if ((roles ?? []).some((r: any) => r.owner_id && r.owner_id !== user.id)) {
          return json({ error: "Use a conta do dono do painel (funcionários não conectam servidores)." }, 403);
        }
        const token = `nxs_${randomBytes(32).toString("hex")}`;
        const token_hash = createHash("sha256").update(token).digest("hex");
        const { error: e2 } = await db.from("onprem_sync_tokens").upsert(
          { owner_id: user.id, token_hash, created_at: new Date().toISOString(), last_used_at: null },
          { onConflict: "owner_id" },
        );
        if (e2) return json({ error: "Erro ao gerar a conexão." }, 500);
        const { data: prof } = await db.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
        return json({ token, user_id: user.id, email: user.email, full_name: prof?.full_name ?? "" });
      },
    },
  },
});
