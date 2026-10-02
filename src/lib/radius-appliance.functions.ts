import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Apenas o administrador da plataforma pode gerenciar servidores RADIUS.");
}

export const listRadiusAppliances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return [];
    const { data } = await (context.supabase as any).from("radius_appliances").select("hostname, local_ip, version, radius_ok, uptime, last_seen_at").order("last_seen_at", { ascending: false });
    return (data ?? []) as { hostname: string; local_ip: string | null; version: string | null; radius_ok: boolean; uptime: string | null; last_seen_at: string }[];
  });

export const approveRadiusPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/, "Digite os 6 números do código.") }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createHash, randomBytes } = await import("crypto");
    const db = supabaseAdmin as any;
    const { data: p } = await db.from("radius_pairings").select("*").eq("code", data.code).eq("status", "pending").maybeSingle();
    if (!p || new Date(p.expires_at) < new Date()) throw new Error("Código inválido ou expirado. Reinicie o servidor para gerar outro.");
    const token = randomBytes(32).toString("hex");
    const token_hash = createHash("sha256").update(token).digest("hex");
    let hostname = p.hostname as string;
    const { data: exists } = await db.from("radius_appliances").select("hostname").eq("hostname", hostname).maybeSingle();
    if (exists) hostname = `${hostname}-${data.code.slice(0, 3)}`;
    const { error } = await db.from("radius_appliances").insert({ hostname, local_ip: p.local_ip, token_hash, version: "", radius_ok: false });
    if (error) throw new Error(error.message);
    await db.from("radius_pairings").update({ status: "approved", issued_token: token }).eq("code", data.code);
    return { hostname, local_ip: p.local_ip as string | null };
  });

export const removeRadiusAppliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostname: z.string().min(1).max(90) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("radius_appliances").delete().eq("hostname", data.hostname);
    return { ok: true };
  });
