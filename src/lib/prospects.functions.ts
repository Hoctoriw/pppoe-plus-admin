import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { automationSchema } from "@/lib/prospect-automation";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Apenas o administrador pode usar a prospecção.");
}

const rowSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  company: z.string().trim().max(200).default(""),
  city: z.string().trim().max(120).default(""),
  uf: z.string().trim().toUpperCase().max(2).default(""),
});

export const importProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(z.unknown()).max(30000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const seen = new Set<string>();
    const rows = data.rows.flatMap((r) => { const p = rowSchema.safeParse(r); if (!p.success || seen.has(p.data.email)) return []; seen.add(p.data.email); return [p.data]; });
    let added = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const { data: ins, error } = await context.supabase.from("prospects").upsert(rows.slice(i, i + 1000), { onConflict: "email", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      added += ins?.length ?? 0;
    }
    return { valid: rows.length, added };
  });

export const prospectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const out: Record<string, number> = {};
    for (const s of ["pendente", "enviado", "falhou", "descadastrado"]) {
      const { count } = await context.supabase.from("prospects").select("id", { count: "exact", head: true }).eq("status", s);
      out[s] = count ?? 0;
    }
    const { data: recent } = await context.supabase.from("prospects").select("email,company,uf,status,sent_at,error").neq("status", "pendente").order("sent_at", { ascending: false, nullsFirst: false }).limit(50);
    return { counts: out, recent: recent ?? [] };
  });

export const sendProspectBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(100), uf: z.string().regex(/^[A-Z]{2}$/).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { deliverProspects } = await import("@/lib/prospect-delivery.server");
    return deliverProspects(context.supabase, { limit: data.limit, ...(data.uf ? { uf: data.uf } : {}) });
  });

export const getProspectAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("prospect_automation").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveProspectAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => automationSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("prospect_automation").upsert({ id: 1, ...data }, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsubscribeProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("prospects").upsert({ email: data.email, status: "descadastrado" }, { onConflict: "email" });
    return { ok: true };
  });
