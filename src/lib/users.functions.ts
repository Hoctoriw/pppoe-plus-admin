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
    // Funcionários usam a licença da conta principal
    const db = await admin();
    const { data: roles } = await db.from("user_roles").select("owner_id").eq("user_id", context.userId);
    const ownerId = (roles ?? []).find((r) => r.owner_id)?.owner_id as string | undefined;
    const licenseUser = ownerId ?? context.userId;
    const { data } = await db.from("licenses").select("expires_at").eq("user_id", licenseUser).maybeSingle();
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

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta.");
    const db = await admin();
    const { data: target } = await db.from("user_roles").select("role").eq("user_id", data.userId).eq("role", "admin");
    if (target?.length) throw new Error("Não é possível excluir uma conta de administrador.");
    // Apaga os dados do painel dessa conta (clientes, planos, roteadores, cobranças, etc.)
    const tables = ["invoices", "customer_equipment", "customers", "plans", "routers", "bank_accounts"] as const;
    for (const t of tables) {
      await db.from(t).delete().eq("owner_id", data.userId);
    }
    await db.from("user_roles").delete().eq("owner_id", data.userId); // funcionários da conta
    await db.from("user_roles").delete().eq("user_id", data.userId);
    await db.from("licenses").delete().eq("user_id", data.userId);
    await db.from("profiles").delete().eq("id", data.userId);
    const { error } = await db.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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

// ===== Planos de licença e pagamentos Pix =====

export const listLicensePlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("license_plans").select("id, name, days, price, active, includes_network").order("days");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({ ...p, price: Number(p.price), includes_network: !!p.includes_network })) as { id: string; name: string; days: number; price: number; active: boolean; includes_network: boolean }[];
  });

export const saveLicensePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(60), days: z.number().int().min(1).max(3650), price: z.number().positive().max(100000), active: z.boolean(), includes_network: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { id, includes_network, ...rest } = data;
    const row = { ...rest, includes_network: !!includes_network };
    const { error } = id ? await db.from("license_plans").update(row).eq("id", id) : await db.from("license_plans").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLicensePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await (await admin()).from("license_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createLicensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: plan } = await db.from("license_plans").select("*").eq("id", data.planId).eq("active", true).maybeSingle();
    if (!plan) throw new Error("Plano indisponível.");
    const txid = "NX" + crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
    const { data: row, error } = await db.from("license_payments").insert({ user_id: context.userId, plan_id: plan.id, plan_name: plan.name, days: plan.days, amount: plan.price, txid, includes_network: !!plan.includes_network }).select("id, txid, amount").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, txid: row.txid as string, amount: Number(row.amount) };
  });

export const listLicensePayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data } = await db.from("license_payments").select("*").order("created_at", { ascending: false }).limit(200);
    const { data: profiles } = await db.from("profiles").select("id, full_name");
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return (data ?? []).map((p: any) => ({ id: p.id as string, user_id: p.user_id as string, user_name: (names.get(p.user_id) as string) || "Sem nome", plan_name: p.plan_name as string, days: p.days as number, amount: Number(p.amount), txid: p.txid as string, status: p.status as string, created_at: p.created_at as string }));
  });

export const reviewLicensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: p } = await db.from("license_payments").select("*").eq("id", data.id).eq("status", "pending").maybeSingle();
    if (!p) throw new Error("Pagamento não encontrado ou já revisado.");
    if (data.approve) {
      const { data: cur } = await db.from("licenses").select("expires_at, has_network").eq("user_id", p.user_id).maybeSingle();
      const active = cur && new Date(cur.expires_at) > new Date();
      const base = active ? new Date(cur!.expires_at) : new Date();
      const expires_at = new Date(base.getTime() + p.days * 86400000).toISOString();
      // O módulo Rede passa a valer pelo plano pago; mantém se já tinha e a licença segue ativa
      const has_network = !!p.includes_network || (active && !!cur?.has_network);
      const { error } = await db.from("licenses").upsert({ user_id: p.user_id, expires_at, has_network }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
    }
    await db.from("license_payments").update({ status: data.approve ? "approved" : "rejected" }).eq("id", data.id);
    return { ok: true };
  });

// ===== Banco de recebimento das licenças (Asaas) =====
async function loadLicenseSettings(db: any) {
  const { data } = await db.from("license_settings").select("api_key, environment, active").eq("id", 1).maybeSingle();
  return data as { api_key: string | null; environment: "production" | "sandbox"; active: boolean } | null;
}

// Libera a licença de um pagamento pendente (idempotente). Usado pelo aviso do banco e pela consulta.
export async function approveLicensePaymentRow(db: any, p: any) {
  const { data: upd } = await db.from("license_payments").update({ status: "approved" }).eq("id", p.id).eq("status", "pending").select("id");
  if (!upd?.length) return;
  const { data: cur } = await db.from("licenses").select("expires_at").eq("user_id", p.user_id).maybeSingle();
  const base = cur && new Date(cur.expires_at) > new Date() ? new Date(cur.expires_at) : new Date();
  await db.from("licenses").upsert({ user_id: p.user_id, expires_at: new Date(base.getTime() + p.days * 86400000).toISOString() }, { onConflict: "user_id" });
}

export const getLicenseBank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const s = await loadLicenseSettings(await admin());
    return { configured: !!s?.api_key, environment: s?.environment ?? "production", active: !!s?.active };
  });

export const saveLicenseBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ api_key: z.string().max(300).optional(), environment: z.enum(["production", "sandbox"]), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const row: any = { id: 1, environment: data.environment, active: data.active };
    if (data.api_key) row.api_key = data.api_key;
    const { error } = await db.from("license_settings").upsert(row, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLicenseCheckoutMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const s = await loadLicenseSettings(await admin());
    return { automatic: !!(s?.active && s.api_key) };
  });

export const createAutoLicensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid(), cpfCnpj: z.string().regex(/^\D*(\d\D*){11}$|^\D*(\d\D*){14}$/, "Informe um CPF ou CNPJ válido.") }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const s = await loadLicenseSettings(db);
    if (!s?.active || !s.api_key) throw new Error("Pagamento automático indisponível.");
    const { data: plan } = await db.from("license_plans").select("*").eq("id", data.planId).eq("active", true).maybeSingle();
    if (!plan) throw new Error("Plano indisponível.");
    const { data: prof } = await db.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { data: u } = await db.auth.admin.getUserById(context.userId);
    const txid = "NX" + crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase();
    const { data: row, error } = await db.from("license_payments").insert({ user_id: context.userId, plan_id: plan.id, plan_name: plan.name, days: plan.days, amount: plan.price, txid }).select("id").single();
    if (error) throw new Error(error.message);
    const { createLicensePix } = await import("./billing.server");
    const pix = await createLicensePix(s, { id: context.userId, name: prof?.full_name ?? "", email: u?.user?.email ?? null, cpfCnpj: data.cpfCnpj }, Number(plan.price), `Licença Nexora - ${plan.name}`, `license:${row.id}`);
    await db.from("license_payments").update({ provider_charge_id: pix.id, pix_payload: pix.payload }).eq("id", row.id);
    return { id: row.id as string, payload: pix.payload, image: pix.image, amount: Number(plan.price) };
  });

export const checkLicensePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: p } = await db.from("license_payments").select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!p) throw new Error("Pagamento não encontrado.");
    if (p.status === "pending" && p.provider_charge_id) {
      const s = await loadLicenseSettings(db);
      if (s?.api_key) {
        const { licensePixStatus } = await import("./billing.server");
        const st = await licensePixStatus(s, p.provider_charge_id);
        if (st === "RECEIVED" || st === "CONFIRMED") { await approveLicensePaymentRow(db, p); return { paid: true }; }
      }
    }
    return { paid: p.status === "approved" };
  });
