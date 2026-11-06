import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { visibleAppliances, type ApplianceIdentity } from "@/lib/radius-appliance-registry";

export const listRadiusAppliances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).from("radius_appliances").select("*").eq("owner_id", context.userId).order("last_seen_at", { ascending: false });
    return visibleAppliances((data ?? []) as (ApplianceIdentity & { version: string | null; radius_ok: boolean; uptime: string | null; last_seen_at: string })[]);
  });
