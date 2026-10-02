import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TABLES = [
  ["plans", "Planos", "*"],
  ["customers", "Clientes", "*"],
  ["customer_equipment", "Equipamentos", "*"],
  ["routers", "Roteadores", "id,name,base_url,username,dhcp_server,connection_mode,active,radius_enabled,radius_host,radius_auth_port,radius_acct_port,created_at"],
  ["bank_accounts", "Bancos", "id,name,bank_code,agency,agency_digit,account_number,account_digit,wallet,convenio,provider,environment,active,created_at"],
  ["invoices", "Cobranças", "*"],
  ["ftth_nodes", "Rede FTTH", "*"],
] as const;

async function ownerOf(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("owner_id").eq("user_id", userId).not("owner_id", "is", null).maybeSingle();
  return (data?.owner_id as string | undefined) ?? userId;
}

async function buildBackup(supabase: any, owner: string) {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const [t, label, cols] of TABLES) {
    const { data: rows, error } = await supabase.from(t).select(cols).eq("owner_id", owner);
    if (error) throw new Error(`Erro ao ler ${label}: ${error.message}`);
    data[t] = rows ?? [];
    counts[label] = rows?.length ?? 0;
  }
  return { data, counts };
}

export const getBackupSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { data } = await context.supabase.from("backup_settings").select("email,last_sent_at").eq("owner_id", owner).maybeSingle();
    return { email: data?.email ?? "", last_sent_at: data?.last_sent_at ?? null, isOwner: owner === context.userId };
  });

export const saveBackupEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255) }).parse(d))
  .handler(async ({ data, context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    if (owner !== context.userId) throw new Error("Apenas o dono da conta pode alterar o e-mail de backup.");
    const { error } = await context.supabase.from("backup_settings").upsert({ owner_id: owner, email: data.email }, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const downloadBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { data } = await buildBackup(context.supabase, owner);
    return JSON.stringify({ generated_at: new Date().toISOString(), ...data }, null, 2);
  });

// Ordem importa: planos/roteadores/bancos antes de clientes; clientes antes de equipamentos e cobranças.
const RESTORE_ORDER = ["plans", "routers", "bank_accounts", "ftth_nodes", "customers", "customer_equipment", "invoices"] as const;

const backupSchema = z.object({
  plans: z.array(z.record(z.string(), z.unknown())).optional(),
  customers: z.array(z.record(z.string(), z.unknown())).optional(),
  customer_equipment: z.array(z.record(z.string(), z.unknown())).optional(),
  routers: z.array(z.record(z.string(), z.unknown())).optional(),
  bank_accounts: z.array(z.record(z.string(), z.unknown())).optional(),
  invoices: z.array(z.record(z.string(), z.unknown())).optional(),
  ftth_nodes: z.array(z.record(z.string(), z.unknown())).optional(),
});

// Campos que nunca podem vir do arquivo (segredos e identidade de dono).
const BLOCKED_FIELDS = new Set(["owner_id", "password", "api_key", "radius_secret"]);

export const restoreBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ json: z.string().max(20_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    if (owner !== context.userId) throw new Error("Apenas o dono da conta pode restaurar o backup.");
    let parsed: unknown;
    try { parsed = JSON.parse(data.json); } catch { throw new Error("Arquivo inválido: não é um JSON de backup."); }
    const backup = backupSchema.parse(parsed);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const restored: Record<string, number> = {};
    for (const table of RESTORE_ORDER) {
      const rows = backup[table as keyof typeof backup] ?? [];
      if (!rows.length) { restored[table] = 0; continue; }
      const clean = rows.map((r) => {
        const row: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (!BLOCKED_FIELDS.has(k)) row[k] = v;
        row["owner_id"] = owner;
        return row;
      });
      const { error } = await (supabaseAdmin as any).from(table).upsert(clean, { onConflict: "id" });
      if (error) throw new Error(`Erro ao restaurar ${table}: ${error.message}`);
      restored[table] = clean.length;
    }
    return { ok: true, restored };
  });

// Chave usada pelo servidor local (on-premise) para copiar os dados desta conta da nuvem.
export const getOnpremSyncInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("onprem_sync_tokens" as any).select("created_at,last_used_at").eq("owner_id", context.userId).maybeSingle();
    const d = data as { created_at: string; last_used_at: string | null } | null;
    return { exists: !!d, created_at: d?.created_at ?? null, last_used_at: d?.last_used_at ?? null };
  });

export const generateOnpremSyncToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    if (owner !== context.userId) throw new Error("Apenas o dono da conta pode gerar a chave de sincronização.");
    const { randomBytes, createHash } = await import("crypto");
    const token = `nxs_${randomBytes(32).toString("hex")}`;
    const hash = createHash("sha256").update(token).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("onprem_sync_tokens").upsert({ owner_id: owner, token_hash: hash, created_at: new Date().toISOString(), last_used_at: null }, { onConflict: "owner_id" });
    if (error) throw new Error(error.message);
    return { token };
  });

export const sendBackupNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await ownerOf(context.supabase, context.userId);
    const { data: s } = await context.supabase.from("backup_settings").select("email").eq("owner_id", owner).maybeSingle();
    if (!s?.email) throw new Error("Cadastre um e-mail de backup primeiro.");
    const { data, counts } = await buildBackup(context.supabase, owner);
    const now = new Date();
    const date = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const { storeBackupFile } = await import("@/lib/backup-file.server");
    const file = await storeBackupFile(owner, JSON.stringify({ generated_at: now.toISOString(), ...data }, null, 2), now);
    const res = await sendTemplateEmail("backup", s.email, {
      templateData: { date, counts, ...file },
      idempotencyKey: `backup-${owner}-${now.getTime()}`,
    });
    if (!res.sent) throw new Error("Este e-mail recusou mensagens anteriormente (descadastro ou devolução). Use outro e-mail.");
    await context.supabase.from("backup_settings").update({ last_sent_at: now.toISOString() }).eq("owner_id", owner);
    return { ok: true };
  });
