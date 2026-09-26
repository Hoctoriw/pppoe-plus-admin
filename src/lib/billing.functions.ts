import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cancelBoleto, emitBoleto, fetchBoleto, type BankAccount } from "./billing.server";

type Ctx = { supabase: any; userId: string };

async function assertManager(_ctx: Ctx) { /* cada usuário opera o próprio financeiro */ }
async function assertAdmin(_ctx: Ctx) { /* cada usuário gerencia as próprias contas */ }
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function getAccount(id: string, owner: string): Promise<BankAccount> {
  const db = await admin();
  const { data, error } = await db.from("bank_accounts").select("*").eq("id", id).eq("owner_id", owner).single();
  if (error || !data) throw new Error("Conta bancária não encontrada.");
  return data as BankAccount;
}

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context);
    const db = await admin();
    const { data } = await db
      .from("bank_accounts")
      .select("id, name, bank_code, agency, account_number, wallet, convenio, provider, environment, active")
      .eq("owner_id", context.userId)
      .order("name");
    return data ?? [];
  });

export const saveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    bank_code: z.string().max(10).optional(),
    agency: z.string().max(20).optional(),
    agency_digit: z.string().max(4).optional(),
    account_number: z.string().max(30).optional(),
    account_digit: z.string().max(4).optional(),
    wallet: z.string().max(10).optional(),
    convenio: z.string().max(30).optional(),
    provider: z.enum(["asaas", "inter", "sicoob", "sicredi", "manual"]).default("asaas"),
    api_key: z.string().max(300).optional(),
    environment: z.enum(["production", "sandbox"]).default("production"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const row: any = {
      name: data.name, bank_code: data.bank_code || null, agency: data.agency || null,
      agency_digit: data.agency_digit || null, account_number: data.account_number || null,
      account_digit: data.account_digit || null, wallet: data.wallet || null,
      convenio: data.convenio || null, provider: data.provider, environment: data.environment,
    };
    if (data.api_key) row["api_key"] = data.api_key;
    if (data.id) {
      const { error } = await db.from("bank_accounts").update(row).eq("id", data.id).eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      if (data.provider === "asaas" && !data.api_key) throw new Error("Informe a chave de API do Asaas.");
      const { error } = await db.from("bank_accounts").insert({ ...row, owner_id: context.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { error } = await db.from("bank_accounts").delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const emitInvoiceBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid(), bank_account_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const db = await admin();
    const { data: invoice, error } = await db
      .from("invoices")
      .select("*, customers(*)")
      .eq("id", data.invoice_id)
      .eq("owner_id", context.userId)
      .single();
    if (error || !invoice) throw new Error("Cobrança não encontrada.");
    if (!invoice.customers) throw new Error("Cobrança sem cliente vinculado.");
    if (invoice.status === "paid" || invoice.status === "cancelled") throw new Error("Cobrança já paga ou cancelada.");
    if (invoice.provider_charge_id) throw new Error("Esta cobrança já tem boleto emitido.");

    const account = await getAccount(data.bank_account_id, context.userId);
    if (!account.active) throw new Error("Conta bancária inativa.");

    try {
      const result = await emitBoleto(account, invoice, invoice.customers);
      const { error: upErr } = await db.from("invoices").update({
        bank_account_id: account.id,
        provider_charge_id: result.provider_charge_id,
        nosso_numero: result.nosso_numero,
        linha_digitavel: result.linha_digitavel,
        barcode: result.barcode,
        boleto_url: result.boleto_url,
        boleto_status: "issued",
      }).eq("id", invoice.id);
      if (upErr) throw new Error(upErr.message);
      return { ok: true, linha_digitavel: result.linha_digitavel, boleto_url: result.boleto_url };
    } catch (e: any) {
      await db.from("invoices").update({ bank_account_id: account.id, boleto_status: "error" }).eq("id", invoice.id);
      throw new Error(e?.message ?? "Falha ao emitir boleto.");
    }
  });

export const refreshInvoiceBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const db = await admin();
    const { data: invoice } = await db.from("invoices").select("*").eq("id", data.invoice_id).eq("owner_id", context.userId).single();
    if (!invoice?.provider_charge_id || !invoice.bank_account_id) throw new Error("Cobrança sem boleto emitido.");
    const account = await getAccount(invoice.bank_account_id, context.userId);
    const info = await fetchBoleto(account, invoice.provider_charge_id);
    const patch: any = {
      nosso_numero: info.nosso_numero ?? invoice.nosso_numero,
      linha_digitavel: info.linha_digitavel ?? invoice.linha_digitavel,
      barcode: info.barcode ?? invoice.barcode,
      boleto_url: info.boleto_url ?? invoice.boleto_url,
    };
    if (info.status === "RECEIVED" || info.status === "CONFIRMED") {
      patch.boleto_status = "paid";
      patch.status = "paid";
      patch.paid_at = new Date().toISOString().slice(0, 10);
      patch.method = "boleto";
    }
    await db.from("invoices").update(patch).eq("id", invoice.id);
    return { ok: true, status: info.status };
  });

export const cancelInvoiceBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context);
    const db = await admin();
    const { data: invoice } = await db.from("invoices").select("*").eq("id", data.invoice_id).eq("owner_id", context.userId).single();
    if (!invoice?.provider_charge_id || !invoice.bank_account_id) throw new Error("Cobrança sem boleto emitido.");
    const account = await getAccount(invoice.bank_account_id, context.userId);
    await cancelBoleto(account, invoice.provider_charge_id);
    await db.from("invoices").update({
      boleto_status: "cancelled", provider_charge_id: null, nosso_numero: null,
      linha_digitavel: null, barcode: null, boleto_url: null,
    }).eq("id", invoice.id);
    return { ok: true };
  });
