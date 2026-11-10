import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().regex(/^[0-9()+\-\s]{10,20}$/),
  email: z.string().trim().toLowerCase().email().max(255),
  size: z.enum(["até 200", "200 a 1.000", "mais de 1.000"]),
});

export const requestDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("demo_requests").select("id", { count: "exact", head: true }).eq("email", data.email).gte("created_at", since);
    if ((count ?? 0) >= 2) return { ok: true };
    const { data: row, error } = await supabaseAdmin.from("demo_requests").insert(data).select("id").single();
    if (error || !row) { console.error("demo insert", error); throw new Error("Não foi possível enviar agora. Tente novamente."); }
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    try { await sendTemplateEmail("demo-welcome", data.email, { templateData: { name: data.name, company: data.company }, idempotencyKey: `demo-welcome-${row.id}` }); } catch (e) { console.error("demo welcome email", e); }
    try {
      const { data: s } = await supabaseAdmin.from("app_settings").select("support_email").eq("id", 1).maybeSingle();
      if (s?.support_email) await sendTemplateEmail("demo-lead-notice", s.support_email, { templateData: data, idempotencyKey: `demo-notice-${row.id}` });
    } catch (e) { console.error("demo notice email", e); }
    return { ok: true };
  });

export const listDemoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("demo_requests").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setDemoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "novo" | "contatado" | "cliente" | "descartado" }) => z.object({ id: z.string().uuid(), status: z.enum(["novo", "contatado", "cliente", "descartado"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("demo_requests").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
