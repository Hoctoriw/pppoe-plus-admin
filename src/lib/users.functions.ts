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
      if (data.role === "admin" && data.userId !== context.userId) throw new Error("Somente a conta principal pode ser administradora.");
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

// ===== Equipe: funcionários da conta =====

async function assertAccountOwner(ctx: Ctx) {
  const db = await admin();
  const { data: rows } = await db.from("user_roles").select("owner_id").eq("user_id", ctx.userId);
  if ((rows ?? []).some((r) => r.owner_id)) throw new Error("Funcionários não podem gerenciar a equipe.");
  return db;
}

export const listTeamUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAccountOwner(context);
    const { data: rows } = await db.from("user_roles").select("user_id, role").eq("owner_id", context.userId);
    const ids = [...new Set((rows ?? []).map((r) => r.user_id as string))];
    if (!ids.length) return [] as { id: string; full_name: string; email: string; roles: string[]; created_at: string }[];
    const { data: profiles } = await db.from("profiles").select("id, full_name, created_at").in("id", ids);
    const emails = new Map<string, string>();
    for (const id of ids) {
      const { data: u } = await db.auth.admin.getUserById(id);
      emails.set(id, u?.user?.email ?? "");
    }
    return (profiles ?? []).map((p) => ({
      id: p.id as string,
      full_name: p.full_name as string,
      email: emails.get(p.id as string) ?? "",
      created_at: p.created_at as string,
      roles: (rows ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
    }));
  });

export const createTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(["operator", "viewer"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAccountOwner(context);
    const { data: created, error } = await db.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;
    const { error: roleErr } = await db.from("user_roles").upsert(
      { user_id: uid, role: data.role, owner_id: context.userId },
      { onConflict: "user_id,role" },
    );
    if (roleErr) throw new Error(roleErr.message);
    return { ok: true, id: uid };
  });

export const deleteTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAccountOwner(context);
    const { data: rows } = await db.from("user_roles").select("id").eq("user_id", data.userId).eq("owner_id", context.userId);
    if (!rows?.length) throw new Error("Este usuário não pertence à sua equipe.");
    await db.from("user_roles").delete().eq("user_id", data.userId).eq("owner_id", context.userId);
    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
