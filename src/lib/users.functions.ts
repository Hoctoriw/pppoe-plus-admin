import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Apenas administradores podem gerenciar usuários.");
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = await admin();
    const [{ data: profiles }, { data: roles }, { data: authData }] = await Promise.all([
      db.from("profiles").select("*").order("full_name"),
      db.from("user_roles").select("user_id, role"),
      db.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const emails = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    return (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: emails.get(p.id) ?? "",
      active: p.active,
      created_at: p.created_at,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin", "operator", "viewer"]),
    grant: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    if (!data.grant) {
      if (data.role === "admin") {
        const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
        const others = (admins ?? []).filter((a) => a.user_id !== data.userId);
        if (!others.length) throw new Error("Não é possível remover o último administrador do sistema.");
      }
      const { error } = await db.from("user_roles").delete().eq("user_id", data.userId).eq("role", data.role);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("user_roles").upsert({ user_id: data.userId, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId && !data.active) throw new Error("Você não pode desativar a própria conta.");
    const db = await admin();
    const { error } = await db.from("profiles").update({ active: data.active }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyLicense = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (isAdmin) return { valid: true, admin: true, expires_at: null as string | null };
    const { data } = await context.supabase.from("licenses").select("expires_at").eq("user_id", context.userId).maybeSingle();
    const exp = (data?.expires_at as string | undefined) ?? null;
    return { valid: !!exp && new Date(exp) > new Date(), admin: false, expires_at: exp };
  });

export const listLicenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data } = await db.from("licenses").select("user_id, expires_at");
    return (data ?? []) as { user_id: string; expires_at: string }[];
  });

export const extendLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), days: z.number().int().min(-3650).max(3650) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: cur } = await db.from("licenses").select("expires_at").eq("user_id", data.userId).maybeSingle();
    const base = cur && new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
    const expires_at = data.days === 0 ? new Date().toISOString() : new Date(base.getTime() + data.days * 86400000).toISOString();
    const { error } = await db.from("licenses").upsert({ user_id: data.userId, expires_at }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true, expires_at };
  });
