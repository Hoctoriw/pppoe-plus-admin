import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEFAULT_SUPPORT_EMAIL = "suporte@syncrontelecom.com.br";

export const setTrialDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(0).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_trial_days", { _days: data.days });
    if (error) throw new Error(error.message);
    return { days: data.days };
  });

/** Admin da plataforma altera o e-mail de suporte exibido no painel e no chat. */
export const setSupportEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("set_support_email", { _email: data.email });
    if (error) throw new Error(error.message);
    return { ok: true, email: data.email };
  });

/** Dono da conta sempre pode exportar; funcionários só se liberados pelo dono. */
export const canExportNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("can_export_network");
    if (error) throw new Error(error.message);
    return { allowed: !!data };
  });

export const setTeamExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), allowed: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("set_team_export", { _user_id: data.userId, _allowed: data.allowed });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
