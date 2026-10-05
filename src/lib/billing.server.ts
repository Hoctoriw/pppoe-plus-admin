// Integração com provedores de cobrança (boleto registrado).
// Chaves de API ficam na tabela admin-only bank_accounts e são lidas via service role
// após checagem de função — nunca chegam ao navegador.

export type BankAccount = {
  id: string;
  name: string;
  provider: "asaas" | "inter" | "sicoob" | "sicredi" | "manual";
  api_key: string | null;
  environment: "production" | "sandbox";
  active: boolean;
};

const ASAAS_BASE = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
} as const;

async function asaas<T = any>(account: BankAccount, method: string, path: string, body?: unknown): Promise<T> {
  if (!account.api_key) throw new Error("Conta sem chave de API configurada.");
  const base = ASAAS_BASE[account.environment] ?? ASAAS_BASE["production"];
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: account.api_key },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description ?? data?.message ?? `Erro ${res.status} no provedor.`;
    throw new Error(msg);
  }
  return data as T;
}

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D/g, "");
}

// Garante que o cliente existe no Asaas e retorna o id dele lá.
async function asaasEnsureCustomer(account: BankAccount, customer: any): Promise<string> {
  const doc = onlyDigits(customer.document);
  if (doc) {
    const found = await asaas(account, "GET", `/customers?cpfCnpj=${doc}`);
    if (found?.data?.length) return found.data[0].id as string;
  }
  const created = await asaas(account, "POST", "/customers", {
    name: customer.full_name,
    cpfCnpj: doc || undefined,
    email: customer.email || undefined,
    phone: onlyDigits(customer.phone) || undefined,
    postalCode: onlyDigits(customer.postal_code) || undefined,
    address: customer.street || undefined,
    addressNumber: customer.address_number || undefined,
    province: customer.district || undefined,
    externalReference: customer.id,
  });
  return created.id as string;
}

export type BoletoResult = {
  provider_charge_id: string;
  nosso_numero: string | null;
  linha_digitavel: string | null;
  barcode: string | null;
  boleto_url: string | null;
};

// Emite boleto registrado para uma cobrança. Hoje suporta Asaas; demais
// provedores retornam erro orientando a configuração.
export async function emitBoleto(account: BankAccount, invoice: any, customer: any): Promise<BoletoResult> {
  if (account.provider !== "asaas") {
    throw new Error(`Emissão automática via ${account.provider.toUpperCase()} ainda não está disponível. Use uma conta Asaas ou emita manualmente no internet banking.`);
  }
  const customerId = await asaasEnsureCustomer(account, customer);
  const payment = await asaas(account, "POST", "/payments", {
    customer: customerId,
    billingType: "BOLETO",
    value: Number(invoice.amount),
    dueDate: invoice.due_date,
    description: `Mensalidade - ${customer.full_name}`,
    externalReference: invoice.id,
  });
  let linha: string | null = null;
  let barcode: string | null = null;
  try {
    const field = await asaas(account, "GET", `/payments/${payment.id}/identificationField`);
    linha = field?.identificationField ?? null;
    barcode = field?.barCode ?? null;
  } catch {
    // linha digitável pode demorar a ficar disponível; o webhook/botão de atualizar cobre isso
  }
  return {
    provider_charge_id: payment.id as string,
    nosso_numero: (payment.nossoNumero as string) ?? null,
    linha_digitavel: linha,
    barcode,
    boleto_url: (payment.bankSlipUrl as string) ?? (payment.invoiceUrl as string) ?? null,
  };
}

// Cancela uma cobrança emitida no provedor.
export async function cancelBoleto(account: BankAccount, providerChargeId: string): Promise<void> {
  if (account.provider !== "asaas") return;
  await asaas(account, "DELETE", `/payments/${providerChargeId}`);
}

// Consulta a situação atual da cobrança no provedor (para atualizar linha digitável/status).
export async function fetchBoleto(account: BankAccount, providerChargeId: string): Promise<Partial<BoletoResult> & { status: string }> {
  if (account.provider !== "asaas") throw new Error("Provedor sem consulta automática.");
  const payment = await asaas(account, "GET", `/payments/${providerChargeId}`);
  let linha: string | null = null;
  let barcode: string | null = null;
  try {
    const field = await asaas(account, "GET", `/payments/${providerChargeId}/identificationField`);
    linha = field?.identificationField ?? null;
    barcode = field?.barCode ?? null;
  } catch { /* ainda indisponível */ }
  return {
    status: payment.status as string,
    nosso_numero: (payment.nossoNumero as string) ?? null,
    linha_digitavel: linha,
    barcode,
    boleto_url: (payment.bankSlipUrl as string) ?? (payment.invoiceUrl as string) ?? null,
  };
}

// ===== Pix das licenças (conta Asaas da plataforma) =====
export type LicenseSettings = { api_key: string | null; environment: "production" | "sandbox"; active: boolean; provider?: "asaas" | "mercadopago" };

// ===== Mercado Pago (Pix transparente) =====
async function mp<T = any>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago: ${json?.message || res.status}`);
  return json as T;
}
const asLicAccount = (s: LicenseSettings): BankAccount => ({ id: "license", name: "licencas", provider: "asaas", api_key: s.api_key, environment: s.environment, active: s.active });

export async function createLicensePix(s: LicenseSettings, buyer: { id: string; name: string; email: string | null; cpfCnpj: string }, amount: number, description: string, ref: string) {
  const doc = onlyDigits(buyer.cpfCnpj);
  if (s.provider === "mercadopago") {
    const pay = await mp(s.api_key!, "POST", "/v1/payments", {
      transaction_amount: Math.round(amount * 100) / 100, description, payment_method_id: "pix", external_reference: ref,
      payer: { email: buyer.email || "cliente@nexora.app", first_name: buyer.name || "Cliente", identification: { type: doc.length > 11 ? "CNPJ" : "CPF", number: doc } },
    });
    const td = pay?.point_of_interaction?.transaction_data;
    if (!td?.qr_code) throw new Error("Mercado Pago não retornou o QR Code Pix. Verifique se sua conta tem chave Pix cadastrada.");
    return { id: String(pay.id), payload: td.qr_code as string, image: `data:image/png;base64,${td.qr_code_base64}` };
  }
  const acc = asLicAccount(s);
  const found = await asaas(acc, "GET", `/customers?cpfCnpj=${doc}`);
  const customerId = found?.data?.length ? found.data[0].id : (await asaas(acc, "POST", "/customers", { name: buyer.name || "Cliente Nexora", cpfCnpj: doc, email: buyer.email || undefined, externalReference: buyer.id })).id;
  const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const pay = await asaas(acc, "POST", "/payments", { customer: customerId, billingType: "PIX", value: amount, dueDate: due, description, externalReference: ref });
  const qr = await asaas(acc, "GET", `/payments/${pay.id}/pixQrCode`);
  return { id: pay.id as string, payload: qr.payload as string, image: `data:image/png;base64,${qr.encodedImage}` };
}

export async function licensePixStatus(s: LicenseSettings, chargeId: string): Promise<string> {
  if (s.provider === "mercadopago") {
    const p = await mp(s.api_key!, "GET", `/v1/payments/${encodeURIComponent(chargeId)}`);
    return p.status === "approved" ? "RECEIVED" : String(p.status).toUpperCase();
  }
  const p = await asaas(asLicAccount(s), "GET", `/payments/${chargeId}`);
  return p.status as string;
}
