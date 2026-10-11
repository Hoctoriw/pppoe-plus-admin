import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Central do Assinante: login por CPF/CNPJ + senha da conexão (PPPoE/Hotspot).
// Sessão = token HMAC assinado no servidor (8h), sem conta no sistema de login do painel.
async function secret() {
  const s = process.env["RADIUS_API_TOKEN"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Portal indisponível");
  return s;
}
async function sign(payload: string) {
  const { createHmac } = await import("crypto");
  return createHmac("sha256", await secret()).update(payload).digest("hex");
}
async function makeToken(id: string) {
  const p = `${id}.${Date.now() + 8 * 3600_000}`;
  return `${p}.${await sign(p)}`;
}
async function readToken(token: string) {
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) throw new Error("Sessão expirada. Entre novamente.");
  const { timingSafeEqual } = await import("crypto");
  const good = await sign(`${id}.${exp}`);
  if (good.length !== sig.length || !timingSafeEqual(Buffer.from(good), Buffer.from(sig))) throw new Error("Sessão inválida");
  return id;
}
const digits = (s: string) => s.replace(/\D/g, "");

export const portalLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ document: z.string().trim().min(11).max(20), password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = digits(data.document);
    const { data: rows } = await supabaseAdmin.from("customers").select("id, document, pppoe_password").not("pppoe_password", "is", null).limit(2000);
    const c = (rows ?? []).find((r) => digits(r.document) === doc && r.pppoe_password === data.password);
    if (!c) throw new Error("CPF/CNPJ ou senha incorretos.");
    return { token: await makeToken(c.id) };
  });

export const portalData = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    const id = await readToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await (supabaseAdmin as any).from("customers")
      .select("id, owner_id, full_name, document, email, phone, street, address_number, district, city, state, technology, status, due_day, pppoe_username, acct_input_bytes, acct_output_bytes, acct_session_time, acct_updated_at, online, plans(name, download_mbps, upload_mbps, monthly_price)")
      .eq("id", id).maybeSingle();
    if (!c) throw new Error("Cliente não encontrado");
    const { data: inv } = await supabaseAdmin.from("invoices")
      .select("id, amount, due_date, paid_at, status, linha_digitavel, boleto_url")
      .eq("customer_id", id).eq("owner_id", c.owner_id).order("due_date", { ascending: false }).limit(24);
    const { owner_id: _o, ...customer } = c;
    return { customer, invoices: inv ?? [] };
  });
