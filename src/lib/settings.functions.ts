import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DEFAULT_SUPPORT_EMAIL = "suporte@syncrontelecom.com.br";

/** Admin da plataforma altera o e-mail de suporte exibido no painel e no chat. */
export const setSupportEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o administrador pode alterar o e-mail de suporte.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({ id: 1, support_email: data.email, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, email: data.email };
  });

/** Dono da conta sempre pode exportar; funcionários só se liberados pelo dono. */
export const canExportNetwork = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("user_roles").select("owner_id, can_export_network").eq("user_id", context.userId);
    const staff = (rows ?? []).filter((r) => r.owner_id);
    if (!staff.length) return { allowed: true };
    return { allowed: staff.some((r) => r.can_export_network) };
  });

export const setTeamExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), allowed: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mine } = await supabaseAdmin.from("user_roles").select("owner_id").eq("user_id", context.userId);
    if ((mine ?? []).some((r) => r.owner_id)) throw new Error("Funcionários não podem alterar permissões.");
    const { error } = await supabaseAdmin.from("user_roles").update({ can_export_network: data.allowed })
      .eq("user_id", data.userId).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
