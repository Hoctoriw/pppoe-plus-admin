import { createFileRoute } from "@tanstack/react-router";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";

// Recebe do servidor local (on-premise) os cadastros criados/alterados lá e grava na conta dona do token.
// Regras: só a conta do token; nunca sobrescreve linha de outra conta; vence o updated_at mais recente;
// senhas de roteador e chaves de banco nunca são aceitas por aqui.
const ORDER = ["plans", "routers", "bank_accounts", "ftth_nodes", "customers", "customer_equipment", "invoices"] as const;
const BLOCKED = new Set(["owner_id", "password", "radius_secret", "api_key"]);
const REQUIRED_ON_INSERT: Record<string, Record<string, unknown>> = { routers: { password: "" } };

const row = z.record(z.string(), z.unknown()).refine((r) => typeof r["id"] === "string" && /^[0-9a-f-]{36}$/i.test(r["id"] as string));
const Body = z.object({
  tables: z.record(z.string(), z.array(row).max(5000)).default({}),
  users: z
    .array(z.object({ id: z.string().uuid(), email: z.string().email().max(255), full_name: z.string().max(200).optional().default(""), role: z.enum(["operator", "viewer"]).default("operator") }))
    .max(200)
    .default([]),
});

export const Route = createFileRoute("/api/public/onprem/push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!/^nxs_[a-f0-9]{64}$/.test(token)) return new Response("Unauthorized", { status: 401 });
        const hash = createHash("sha256").update(token).digest("hex");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as any;
        const { data: tok } = await db.from("onprem_sync_tokens").select("owner_id").eq("token_hash", hash).maybeSingle();
        if (!tok) return new Response("Unauthorized", { status: 401 });
        const owner = tok.owner_id as string;

        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return new Response("Dados inválidos", { status: 400 });
        }

        const result: Record<string, number> = {};
        for (const t of ORDER) {
          const rows = body.tables[t] ?? [];
          if (!rows.length) continue;
          const ids = rows.map((r) => r["id"] as string);
          const { data: existing, error: e1 } = await db.from(t).select("id, owner_id, updated_at").in("id", ids);
          if (e1) return new Response(`Erro em ${t}`, { status: 500 });
          const cur = new Map<string, { owner_id: string; updated_at: string }>((existing ?? []).map((x: any) => [x.id, x]));
          const updates: any[] = [];
          const inserts: any[] = [];
          for (const r of rows) {
            const clean: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(r)) if (!BLOCKED.has(k)) clean[k] = v;
            clean["owner_id"] = owner;
            const ex = cur.get(r["id"] as string);
            if (ex) {
              if (ex.owner_id !== owner) continue; // nunca mexe em dados de outra conta
              const incoming = Date.parse(String(r["updated_at"] ?? ""));
              if (!incoming || incoming <= Date.parse(ex.updated_at)) continue; // nuvem já está igual ou mais nova
              updates.push(clean);
            } else {
              inserts.push({ ...(REQUIRED_ON_INSERT[t] ?? {}), ...clean });
            }
          }
          for (const batch of [inserts, updates]) {
            if (!batch.length) continue;
            const { error } = await db.from(t).upsert(batch, { onConflict: "id" });
            if (error) return new Response(`Erro em ${t}: ${error.message}`, { status: 500 });
          }
          result[t] = inserts.length + updates.length;
        }

        // Contas criadas no servidor local viram funcionários da mesma conta na nuvem.
        let users = 0;
        for (const u of body.users) {
          if (u.id === owner) continue;
          const { data: got } = await db.auth.admin.getUserById(u.id);
          let created = false;
          if (!got?.user) {
            const { error } = await db.auth.admin.createUser({
              id: u.id,
              email: u.email,
              password: randomBytes(24).toString("hex"),
              email_confirm: true,
              user_metadata: { full_name: u.full_name },
            });
            if (error) continue; // e-mail já usado por outra conta na nuvem: ignora
            created = true;
          }
          const { data: roles } = await db.from("user_roles").select("id, owner_id").eq("user_id", u.id);
          const mine = (roles ?? []).find((r: any) => r.owner_id === owner);
          const foreign = (roles ?? []).find((r: any) => r.owner_id && r.owner_id !== owner);
          if (foreign) continue;
          if (!mine) {
            if (!created) continue; // conta já existente na nuvem e independente: nunca é tomada
            await db.from("user_roles").delete().eq("user_id", u.id).is("owner_id", null);
            await db.from("user_roles").insert({ user_id: u.id, role: u.role, owner_id: owner });
          }
          users++;
        }

        await db.from("onprem_sync_tokens").update({ last_used_at: new Date().toISOString() }).eq("owner_id", owner);
        return Response.json({ ok: true, tables: result, users });
      },
    },
  },
});
