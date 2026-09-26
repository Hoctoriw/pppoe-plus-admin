import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Check, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Menu, Package, Plus, Radio, Router as RouterIcon, Search, ShieldCheck, Users, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "./dashboard";

type Invoice = {
  id: string; customer_id: string; amount: number; due_date: string; paid_at: string | null;
  status: "open" | "paid" | "overdue" | "cancelled"; method: string | null; notes: string | null;
  customers: Pick<Customer, "full_name" | "document" | "due_day"> | null;
};

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [
    { title: "Financeiro | Nexora ISP" },
    { name: "description", content: "Cobranças, vencimentos e pagamentos dos clientes." },
    { property: "og:title", content: "Financeiro | Nexora ISP" },
    { property: "og:description", content: "Cobranças, vencimentos e pagamentos dos clientes." },
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [panel, setPanel] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function loadData() {
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("invoices").update({ status: "overdue" }).eq("status", "open").lt("due_date", today);
    const [inv, cust] = await Promise.all([
      supabase.from("invoices").select("*, customers(full_name, document, due_day)").order("due_date", { ascending: false }),
      supabase.from("customers").select("*, plans(name, monthly_price)").in("status", ["active", "suspended"]),
    ]);
    setInvoices((inv.data ?? []) as unknown as Invoice[]);
    setCustomers((cust.data ?? []) as unknown as Customer[]);
  }
  useEffect(() => { void loadData(); }, []);

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

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link><NavItem icon={<Wifi />} label="Conexões" /><NavItem icon={<CircleDollarSign />} label="Financeiro" active /></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Financeiro</p><p className="hidden text-xs text-muted-foreground sm:block">Cobranças e pagamentos</p></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground sm:flex">{user.email?.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="p-4 md:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm text-muted-foreground">{filtered.length} cobranças</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Financeiro</h1></div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={generating} onClick={generateMonthly}>{generating ? "Gerando..." : "Gerar cobranças do mês"}</Button>
            <Button onClick={() => setPanel(true)}><Plus />Nova cobrança</Button>
          </div>
        </div>
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
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Pagamento</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {filtered.map(i => <TableRow key={i.id}>
                <TableCell><p className="font-semibold">{i.customers?.full_name ?? "—"}</p><p className="text-xs text-muted-foreground">{i.customers?.document ?? ""}</p></TableCell>
                <TableCell className="font-semibold">{brl(Number(i.amount))}</TableCell>
                <TableCell>{fmtDate(i.due_date)}</TableCell>
                <TableCell>{i.paid_at ? fmtDate(i.paid_at) : "—"}</TableCell>
                <TableCell><InvoiceStatus status={i.status} /></TableCell>
                <TableCell className="whitespace-nowrap">
                  {(i.status === "open" || i.status === "overdue") && <>
                    <Button size="sm" variant="outline" onClick={() => markPaid(i.id)}><Check />Baixar</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancelInvoice(i.id)}>Cancelar</Button>
                  </>}
                </TableCell>
              </TableRow>)}
              {!filtered.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhuma cobrança encontrada. Use "Gerar cobranças do mês" para criar as mensalidades.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
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
  </div>;
}

function InvoiceStatus({ status }: { status: Invoice["status"] }) {
  const map = { open: ["Em aberto", "outline"], overdue: ["Em atraso", "destructive"], paid: ["Paga", "default"], cancelled: ["Cancelada", "secondary"] } as const;
  const [label, variant] = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>; }
