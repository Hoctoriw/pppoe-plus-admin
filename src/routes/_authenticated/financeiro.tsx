import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Building2, Check, ChevronRight, CircleDollarSign, Copy, FileBarcode, Landmark, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Plus, Radio, RefreshCw, Router as RouterIcon, Search, ShieldCheck, Trash2, Users, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { cancelInvoiceBoleto, deleteBankAccount, emitInvoiceBoleto, listBankAccounts, refreshInvoiceBoleto, saveBankAccount } from "@/lib/billing.functions";
import type { Customer } from "./dashboard";

type Invoice = {
  id: string; customer_id: string; amount: number; due_date: string; paid_at: string | null;
  status: "open" | "paid" | "overdue" | "cancelled"; method: string | null; notes: string | null;
  bank_account_id: string | null; nosso_numero: string | null; linha_digitavel: string | null;
  barcode: string | null; boleto_url: string | null; provider_charge_id: string | null;
  boleto_status: "none" | "pending" | "issued" | "paid" | "cancelled" | "error";
  customers: Pick<Customer, "full_name" | "document" | "due_day" | "phone"> | null;
};

type BankAccountRow = {
  id: string; name: string; bank_code: string | null; agency: string | null; account_number: string | null;
  wallet: string | null; convenio: string | null; provider: "asaas" | "inter" | "sicoob" | "sicredi" | "manual";
  environment: "production" | "sandbox"; active: boolean;
};

const PROVIDER_LABEL: Record<BankAccountRow["provider"], string> = {
  asaas: "Asaas", inter: "Banco Inter", sicoob: "Sicoob", sicredi: "Sicredi", manual: "Emissão manual",
};

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [
    { title: "Financeiro | Nexora ISP" },
    { name: "description", content: "Cobranças, vencimentos, boletos e pagamentos dos clientes." },
    { property: "og:title", content: "Financeiro | Nexora ISP" },
    { property: "og:description", content: "Cobranças, vencimentos, boletos e pagamentos dos clientes." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Financeiro,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

function Financeiro() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState<"cobrancas" | "bancos">("cobrancas");
  const [panel, setPanel] = useState(false);
  const [bankPanel, setBankPanel] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccountRow | null>(null);
  const [boletoFor, setBoletoFor] = useState<Invoice | null>(null);
  const [boletoBank, setBoletoBank] = useState("");
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchBanks = useServerFn(listBankAccounts);
  const saveBank = useServerFn(saveBankAccount);
  const removeBank = useServerFn(deleteBankAccount);
  const emitBoleto = useServerFn(emitInvoiceBoleto);
  const refreshBoleto = useServerFn(refreshInvoiceBoleto);
  const cancelBoleto = useServerFn(cancelInvoiceBoleto);

  async function loadData() {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("invoices").update({ status: "overdue" }).eq("status", "open").lt("due_date", today);
    const [inv, cust] = await Promise.all([
      supabase.from("invoices").select("*, customers(full_name, document, due_day, phone)").order("due_date", { ascending: false }),
      supabase.from("customers").select("*, plans(name, monthly_price)").in("status", ["active", "suspended"]),
    ]);
    setInvoices((inv.data ?? []) as unknown as Invoice[]);
    setCustomers((cust.data ?? []) as unknown as Customer[]);
  }
  async function loadBanks() {
    try { setBanks(await fetchBanks() as BankAccountRow[]); } catch { /* sem permissão */ }
  }
  useEffect(() => { void loadData(); void loadBanks(); }, []);

  const filtered = useMemo(() => invoices.filter(i => {
    if (statusFilter !== "all" && i.status !== statusFilter) return false;
    return `${i.customers?.full_name ?? ""} ${i.customers?.document ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }), [invoices, query, statusFilter]);

  const totals = useMemo(() => ({
    open: invoices.filter(i => i.status === "open").reduce((s, i) => s + Number(i.amount), 0),
    overdue: invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0),
    paid: invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0),
  }), [invoices]);

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const { error } = await supabase.from("invoices").insert({
      customer_id: String(f.get("customer")), amount: Number(String(f.get("amount")).replace(",", ".")),
      due_date: String(f.get("due_date")), notes: String(f.get("notes") ?? "") || null, created_by: user.id,
    });
    if (error) setMessage(error.message);
    else { setPanel(false); setMessage(""); await loadData(); }
  }

  async function markPaid(id: string) {
    const { error } = await supabase.from("invoices").update({ status: "paid", paid_at: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) return alert(error.message);
    await loadData();
  }
  async function cancelInvoice(id: string) {
    const { error } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
    if (error) return alert(error.message);
    await loadData();
  }

  async function generateMonthly() {
    setGenerating(true);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { data: existing } = await supabase.from("invoices").select("customer_id").gte("due_date", `${month}-01`).lte("due_date", `${month}-31`).neq("status", "cancelled");
    const already = new Set((existing ?? []).map(e => e.customer_id));
    const rows = customers
      .filter(c => c.due_day && c.plan_id && !already.has(c.id))
      .map(c => {
        const plan = (c as unknown as { plans: { monthly_price: number } | null }).plans;
        return { customer_id: c.id, amount: plan?.monthly_price ?? 0, due_date: `${month}-${String(c.due_day).padStart(2, "0")}`, created_by: user.id };
      })
      .filter(r => r.amount > 0);
    if (!rows.length) { alert("Nenhuma cobrança nova a gerar neste mês. Verifique se os clientes têm plano e dia de vencimento."); setGenerating(false); return; }
    const { error } = await supabase.from("invoices").insert(rows);
    if (error) alert(error.message);
    await loadData();
    setGenerating(false);
  }

  async function saveBankSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy("bank");
    try {
      await saveBank({ data: {
        ...(editingBank ? { id: editingBank.id } : {}),
        name: String(f.get("name")),
        bank_code: String(f.get("bank_code") ?? "") || undefined,
        agency: String(f.get("agency") ?? "") || undefined,
        agency_digit: String(f.get("agency_digit") ?? "") || undefined,
        account_number: String(f.get("account_number") ?? "") || undefined,
        account_digit: String(f.get("account_digit") ?? "") || undefined,
        wallet: String(f.get("wallet") ?? "") || undefined,
        convenio: String(f.get("convenio") ?? "") || undefined,
        provider: String(f.get("provider")) as BankAccountRow["provider"],
        api_key: String(f.get("api_key") ?? "") || undefined,
        environment: String(f.get("environment")) as BankAccountRow["environment"],
      } });
      setBankPanel(false); setEditingBank(null); setMessage("");
      await loadBanks();
    } catch (e: any) { setMessage(e?.message ?? "Erro ao salvar conta."); }
    setBusy(null);
  }

  async function emitBoletoSubmit() {
    if (!boletoFor || !boletoBank) return;
    setBusy("emit");
    try {
      const r = await emitBoleto({ data: { invoice_id: boletoFor.id, bank_account_id: boletoBank } });
      setBoletoFor(null); setBoletoBank("");
      alert(r.linha_digitavel ? `Boleto emitido!\n\nLinha digitável:\n${r.linha_digitavel}` : "Boleto emitido! A linha digitável ficará disponível em instantes — use o botão de atualizar.");
      await loadData();
    } catch (e: any) { alert(e?.message ?? "Falha ao emitir boleto."); }
    setBusy(null);
  }

  async function refreshBoletoClick(inv: Invoice) {
    setBusy(inv.id);
    try { await refreshBoleto({ data: { invoice_id: inv.id } }); await loadData(); }
    catch (e: any) { alert(e?.message ?? "Falha ao atualizar boleto."); }
    setBusy(null);
  }

  async function cancelBoletoClick(inv: Invoice) {
    if (!confirm("Cancelar o boleto emitido no banco? A cobrança continuará aberta.")) return;
    setBusy(inv.id);
    try { await cancelBoleto({ data: { invoice_id: inv.id } }); await loadData(); }
    catch (e: any) { alert(e?.message ?? "Falha ao cancelar boleto."); }
    setBusy(null);
  }

  function copyLinha(inv: Invoice) {
    if (inv.linha_digitavel) void navigator.clipboard.writeText(inv.linha_digitavel);
  }

  function sendWhatsApp(inv: Invoice) {
    const phone = (inv.customers?.phone ?? "").replace(/\D/g, "");
    if (!phone) return alert("Cliente sem telefone cadastrado.");
    const text = `Olá ${inv.customers?.full_name}! Segue sua mensalidade de ${brl(Number(inv.amount))} com vencimento em ${fmtDate(inv.due_date)}.${inv.linha_digitavel ? `\n\nLinha digitável do boleto:\n${inv.linha_digitavel}` : ""}${inv.boleto_url ? `\n\nBoleto: ${inv.boleto_url}` : ""}`;
    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link><NavItem icon={<Wifi />} label="Conexões" /><NavItem icon={<CircleDollarSign />} label="Financeiro" active /></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Financeiro</p><p className="hidden text-xs text-muted-foreground sm:block">Cobranças, boletos e pagamentos</p></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground sm:flex">{user.email?.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="p-4 md:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm text-muted-foreground">{tab === "cobrancas" ? `${filtered.length} cobranças` : `${banks.length} contas bancárias`}</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Financeiro</h1></div>
          <div className="flex gap-2">
            {tab === "cobrancas" ? <>
              <Button variant="outline" disabled={generating} onClick={generateMonthly}>{generating ? "Gerando..." : "Gerar cobranças do mês"}</Button>
              <Button onClick={() => setPanel(true)}><Plus />Nova cobrança</Button>
            </> : <Button onClick={() => { setEditingBank(null); setBankPanel(true); }}><Plus />Nova conta bancária</Button>}
          </div>
        </div>

        <div className="mt-6 flex gap-2 border-b">
          <TabButton active={tab === "cobrancas"} onClick={() => setTab("cobrancas")} icon={<CircleDollarSign className="h-4 w-4" />} label="Cobranças" />
          <TabButton active={tab === "bancos"} onClick={() => setTab("bancos")} icon={<Landmark className="h-4 w-4" />} label="Bancos" />
        </div>

        {tab === "cobrancas" && <>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="border bg-card p-5"><p className="text-sm text-muted-foreground">A receber</p><p className="mt-1 text-2xl font-extrabold">{brl(totals.open)}</p></div>
            <div className="border bg-card p-5"><p className="text-sm text-muted-foreground">Em atraso</p><p className="mt-1 text-2xl font-extrabold text-destructive">{brl(totals.overdue)}</p></div>
            <div className="border bg-card p-5"><p className="text-sm text-muted-foreground">Recebido</p><p className="mt-1 text-2xl font-extrabold text-primary">{brl(totals.paid)}</p></div>
          </div>
          <section className="mt-7 border bg-card">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
              <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por cliente ou documento" value={query} onChange={e => setQuery(e.target.value)} /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="lg:w-48"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="open">Em aberto</SelectItem><SelectItem value="overdue">Em atraso</SelectItem><SelectItem value="paid">Pagas</SelectItem><SelectItem value="cancelled">Canceladas</SelectItem></SelectContent></Select>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Boleto</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {filtered.map(i => <TableRow key={i.id}>
                  <TableCell><p className="font-semibold">{i.customers?.full_name ?? "—"}</p><p className="text-xs text-muted-foreground">{i.customers?.document ?? ""}</p></TableCell>
                  <TableCell className="font-semibold">{brl(Number(i.amount))}</TableCell>
                  <TableCell>{fmtDate(i.due_date)}{i.paid_at && <p className="text-xs text-muted-foreground">pago em {fmtDate(i.paid_at)}</p>}</TableCell>
                  <TableCell><BoletoBadge inv={i} /></TableCell>
                  <TableCell><InvoiceStatus status={i.status} /></TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {(i.status === "open" || i.status === "overdue") && !i.provider_charge_id && <>
                        <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => { setBoletoFor(i); setBoletoBank(banks.find(b => b.active)?.id ?? ""); }}><FileBarcode />Boleto</Button>
                        <Button size="sm" variant="outline" onClick={() => markPaid(i.id)}><Check />Baixar</Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelInvoice(i.id)}>Cancelar</Button>
                      </>}
                      {i.provider_charge_id && <>
                        {i.linha_digitavel && <Button size="sm" variant="outline" title={i.linha_digitavel} onClick={() => copyLinha(i)}><Copy />Linha digitável</Button>}
                        {i.boleto_url && <Button size="sm" variant="outline" onClick={() => window.open(i.boleto_url!, "_blank")}>PDF</Button>}
                        <Button size="sm" variant="outline" onClick={() => sendWhatsApp(i)}><MessageCircle />Enviar</Button>
                        {i.boleto_status !== "paid" && <>
                          <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => refreshBoletoClick(i)}><RefreshCw />Atualizar</Button>
                          <Button size="sm" variant="ghost" disabled={busy === i.id} onClick={() => cancelBoletoClick(i)}>Cancelar boleto</Button>
                        </>}
                      </>}
                    </div>
                  </TableCell>
                </TableRow>)}
                {!filtered.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhuma cobrança encontrada. Use "Gerar cobranças do mês" para criar as mensalidades.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>
        </>}

        {tab === "bancos" && <>
          <section className="mt-7 border bg-card">
            <Table>
              <TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Banco</TableHead><TableHead>Agência / Conta</TableHead><TableHead>Integração</TableHead><TableHead>Ambiente</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {banks.map(b => <TableRow key={b.id}>
                  <TableCell className="font-semibold">{b.name}</TableCell>
                  <TableCell>{b.bank_code ?? "—"}</TableCell>
                  <TableCell>{b.agency ?? "—"} / {b.account_number ?? "—"}</TableCell>
                  <TableCell><Badge variant={b.provider === "manual" ? "secondary" : "default"}>{PROVIDER_LABEL[b.provider]}</Badge></TableCell>
                  <TableCell>{b.environment === "sandbox" ? <Badge variant="outline">Teste</Badge> : <Badge variant="outline">Produção</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => { setEditingBank(b); setBankPanel(true); }}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Excluir a conta ${b.name}?`)) { await removeBank({ data: { id: b.id } }); await loadBanks(); } }}><Trash2 /></Button>
                  </TableCell>
                </TableRow>)}
                {!banks.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhuma conta cadastrada. Cadastre uma conta com integração Asaas para emitir boletos registrados.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>
          <div className="mt-5 border bg-card p-5 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-semibold text-foreground"><Building2 className="h-4 w-4" />Como funciona a emissão de boletos</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Asaas</strong>: emissão automática de boleto registrado com linha digitável, PDF e baixa automática quando o cliente paga. Basta informar a chave de API da conta (menu Integrações no Asaas).</li>
              <li><strong>Baixa automática</strong>: configure o webhook no Asaas apontando para <code className="rounded bg-muted px-1">/api/public/webhooks/asaas</code> do endereço publicado do painel.</li>
              <li><strong>Banco Inter, Sicoob e Sicredi</strong>: cadastre os dados do convênio agora; a emissão automática direta com esses bancos será liberada em seguida.</li>
              <li><strong>Emissão manual</strong>: use para contas em que você emite o boleto no internet banking e registra a linha digitável na cobrança.</li>
            </ul>
          </div>
        </>}
      </div>
    </main>

    {panel && <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">NOVA COBRANÇA</p><h2 className="text-2xl font-extrabold">Cobrança avulsa</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setPanel(false)}><X /></Button></div>
      <form onSubmit={saveInvoice} className="mt-6 space-y-5">
        <div className="space-y-2"><label className="text-sm font-medium">Cliente</label><Select name="customer" required><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label className="text-sm font-medium">Valor (R$)</label><Input name="amount" required inputMode="decimal" placeholder="99,90" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Vencimento</label><Input name="due_date" type="date" required /></div>
        </div>
        <div className="space-y-2"><label className="text-sm font-medium">Observações</label><Input name="notes" /></div>
        <Button className="h-11 w-full" type="submit">Salvar cobrança</Button>
      </form>
      {message && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}</div></div>}

    {bankPanel && <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">{editingBank ? "EDITAR CONTA" : "NOVA CONTA"}</p><h2 className="text-2xl font-extrabold">Conta bancária</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => { setBankPanel(false); setEditingBank(null); }}><X /></Button></div>
      <form onSubmit={saveBankSubmit} className="mt-6 space-y-5">
        <div className="space-y-2"><label className="text-sm font-medium">Nome da conta</label><Input name="name" required defaultValue={editingBank?.name ?? ""} placeholder="Conta principal" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label className="text-sm font-medium">Integração</label><Select name="provider" defaultValue={editingBank?.provider ?? "asaas"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="asaas">Asaas (automático)</SelectItem><SelectItem value="inter">Banco Inter</SelectItem><SelectItem value="sicoob">Sicoob</SelectItem><SelectItem value="sicredi">Sicredi</SelectItem><SelectItem value="manual">Emissão manual</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><label className="text-sm font-medium">Ambiente</label><Select name="environment" defaultValue={editingBank?.environment ?? "production"}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="production">Produção</SelectItem><SelectItem value="sandbox">Teste (sandbox)</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2"><label className="text-sm font-medium">Chave de API {editingBank && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</label><Input name="api_key" type="password" placeholder="$aact_..." /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label className="text-sm font-medium">Código do banco</label><Input name="bank_code" defaultValue={editingBank?.bank_code ?? ""} placeholder="001" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Convênio</label><Input name="convenio" defaultValue={editingBank?.convenio ?? ""} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label className="text-sm font-medium">Agência</label><Input name="agency" defaultValue={editingBank?.agency ?? ""} /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Dígito</label><Input name="agency_digit" defaultValue="" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><label className="text-sm font-medium">Conta</label><Input name="account_number" defaultValue={editingBank?.account_number ?? ""} /></div>
          <div className="space-y-2"><label className="text-sm font-medium">Dígito</label><Input name="account_digit" defaultValue="" /></div>
        </div>
        <div className="space-y-2"><label className="text-sm font-medium">Carteira</label><Input name="wallet" defaultValue={editingBank?.wallet ?? ""} placeholder="109" /></div>
        <Button className="h-11 w-full" type="submit" disabled={busy === "bank"}>{busy === "bank" ? "Salvando..." : "Salvar conta"}</Button>
      </form>
      {message && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}</div></div>}

    {boletoFor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4"><div className="w-full max-w-md bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">Emitir boleto</h2><Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setBoletoFor(null)}><X /></Button></div>
      <p className="mt-2 text-sm text-muted-foreground">{boletoFor.customers?.full_name} — {brl(Number(boletoFor.amount))}, vencimento {fmtDate(boletoFor.due_date)}</p>
      <div className="mt-5 space-y-2"><label className="text-sm font-medium">Conta bancária</label>
        <Select value={boletoBank} onValueChange={setBoletoBank}><SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger><SelectContent>{banks.filter(b => b.active).map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({PROVIDER_LABEL[b.provider]})</SelectItem>)}</SelectContent></Select>
      </div>
      {!banks.length && <p className="mt-3 text-sm text-destructive">Cadastre uma conta bancária na aba Bancos antes de emitir boletos.</p>}
      <Button className="mt-5 h-11 w-full" disabled={!boletoBank || busy === "emit"} onClick={emitBoletoSubmit}>{busy === "emit" ? "Emitindo..." : "Emitir boleto registrado"}</Button>
    </div></div>}
  </div>;
}

function BoletoBadge({ inv }: { inv: Invoice }) {
  if (inv.boleto_status === "issued") return <Badge variant="default">Emitido</Badge>;
  if (inv.boleto_status === "paid") return <Badge variant="default">Pago (boleto)</Badge>;
  if (inv.boleto_status === "error") return <Badge variant="destructive">Erro na emissão</Badge>;
  if (inv.boleto_status === "cancelled") return <Badge variant="secondary">Boleto cancelado</Badge>;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return <button onClick={onClick} className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${active ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{icon}{label}</button>;
}

function InvoiceStatus({ status }: { status: Invoice["status"] }) {
  const map = { open: ["Em aberto", "outline"], overdue: ["Em atraso", "destructive"], paid: ["Paga", "default"], cancelled: ["Cancelada", "secondary"] } as const;
  const [label, variant] = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>; }
