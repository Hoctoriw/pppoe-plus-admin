import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRadiusAppliances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return [];
    const { data } = await (context.supabase as any).from("radius_appliances").select("*").order("last_seen_at", { ascending: false });
    return (data ?? []) as { hostname: string; local_ip: string | null; version: string | null; radius_ok: boolean; uptime: string | null; last_seen_at: string }[];
  });
