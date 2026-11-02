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

// Somente colunas de negócio conhecidas podem vir do arquivo (nunca owner_id, segredos ou campos internos).
const ALLOWED: Record<string, string[]> = {
  plans: ["id","name","download_mbps","upload_mbps","monthly_price","technology","status","description"],
  routers: ["id","name","base_url","username","dhcp_server","connection_mode","active","radius_enabled","radius_host","radius_auth_port","radius_acct_port","via_agent"],
  bank_accounts: ["id","name","bank_code","agency","agency_digit","account_number","account_digit","wallet","convenio","provider","environment","active"],
  ftth_nodes: ["id","node_type","name","latitude","longitude","parent_id","pon_port","tx_power_dbm","splitter_ratio","fusion_count","connector_count","ports","cable_fibers","cable_length_m","notes","splitter_type","splitter_tap","parent_leg","cable_anchors","cable_fiber_number","distribution_ratio","parent_port","slack_m","parent_in_fiber"],
  customers: ["id","full_name","document","email","phone","street","address_number","district","city","state","postal_code","technology","plan_id","pppoe_username","pppoe_password","ipoe_ip","mac_address","status","notes","router_id","due_day","latitude","longitude","cto_id","cto_port"],
  customer_equipment: ["id","customer_id","equipment_type","brand","model","serial_number","mac_address","delivered_at","returned_at","notes"],
  invoices: ["id","customer_id","amount","due_date","paid_at","status","method","notes","bank_account_id","nosso_numero","linha_digitavel","barcode","boleto_url","provider_charge_id","boleto_status"],
};
const uuid = z.string().uuid();

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
    const db = supabaseAdmin as any;
    const restored: Record<string, number> = {};
    for (const table of RESTORE_ORDER) {
      const rows = backup[table as keyof typeof backup] ?? [];
      if (!rows.length) { restored[table] = 0; continue; }
      const allowed = ALLOWED[table]!;
      const clean = rows.map((r) => {
        const row: Record<string, unknown> = {};
        for (const k of allowed) if (k in r) row[k] = r[k];
        if (!uuid.safeParse(row["id"]).success) throw new Error(`Arquivo inválido: registro sem id válido em ${table}.`);
        row["owner_id"] = owner;
        return row;
      });
      // Recusa ids que já pertencem a outro provedor (impede sobrescrever dados de terceiros).
      const ids = clean.map((r) => r["id"] as string);
      for (let i = 0; i < ids.length; i += 500) {
        const { data: foreign, error: fe } = await db.from(table).select("id").in("id", ids.slice(i, i + 500)).neq("owner_id", owner).limit(1);
        if (fe) throw new Error(`Erro ao validar ${table}.`);
        if (foreign?.length) throw new Error(`Arquivo inválido: contém registros que não pertencem a esta conta (${table}).`);
      }
      const { error } = await db.from(table).upsert(clean, { onConflict: "id" });
      if (error) throw new Error(`Erro ao restaurar ${table}: ${error.message}`);
      restored[table] = clean.length;
    }
    return { ok: true, restored };
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
