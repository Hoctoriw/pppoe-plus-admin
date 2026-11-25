import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { makePortalToken, readPortalToken, assertPortalSession } from "./portal-session.server";

// Central do Assinante: login por CPF/CNPJ + senha da conexão (PPPoE/Hotspot).
// Sessão = token HMAC assinado no servidor (8h), sem conta no sistema de login do painel.
const digits = (s: string) => s.replace(/\D/g, "");

export const portalLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ document: z.string().trim().min(11).max(20), password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["RADIUS_API_TOKEN"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!key) throw new Error("Portal indisponível");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const doc = digits(data.document);
    const { data: rows } = await supabaseAdmin.from("customers").select("id, owner_id, document, pppoe_password, status").not("pppoe_password", "is", null).limit(2000);
    const c = (rows ?? []).find((r) => digits(r.document) === doc && r.pppoe_password === data.password);
    if (!c) throw new Error("CPF/CNPJ ou senha incorretos.");
    return { token: makePortalToken(c, key) };
  });

export const portalData = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().max(300) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["RADIUS_API_TOKEN"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!key) throw new Error("Portal indisponível");
    const claims = readPortalToken(data.token, key);
    const { id } = claims;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await (supabaseAdmin as any).from("customers")
      .select("id, owner_id, pppoe_password, full_name, document, email, phone, street, address_number, district, city, state, technology, status, due_day, pppoe_username, acct_input_bytes, acct_output_bytes, acct_session_time, acct_updated_at, online, plans(name, download_mbps, upload_mbps, monthly_price)")
      .eq("id", id).maybeSingle();
    assertPortalSession(claims, c, key);
    const { data: inv } = await supabaseAdmin.from("invoices")
      .select("id, amount, due_date, paid_at, status, linha_digitavel, boleto_url")
      .eq("customer_id", id).eq("owner_id", c.owner_id).order("due_date", { ascending: false }).limit(24);
    const { owner_id: _o, pppoe_password: _password, ...customer } = c;
    return { customer, invoices: inv ?? [] };
  });
