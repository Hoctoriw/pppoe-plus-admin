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
    const res = await sendTemplateEmail("backup", s.email, {
      templateData: { date, counts, json: JSON.stringify({ generated_at: now.toISOString(), ...data }, null, 1) },
      idempotencyKey: `backup-${owner}-${now.getTime()}`,
    });
    if (!res.sent) throw new Error("Este e-mail recusou mensagens anteriormente (descadastro ou devolução). Use outro e-mail.");
    await context.supabase.from("backup_settings").update({ last_sent_at: now.toISOString() }).eq("owner_id", owner);
    return { ok: true };
  });
