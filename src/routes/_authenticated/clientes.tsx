import { AdminOnly } from "@/components/AdminOnly";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Menu, Package, Plus, Radio, UserPlus, RefreshCw, Router as RouterIcon, Search, ShieldCheck, Users, Wifi, X } from "lucide-react";
import { listRouters, provisionCustomer } from "@/lib/mikrotik.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { CustomerForm, Status, addressFromForm, type Customer, type Plan } from "./dashboard";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [
    { title: "Clientes | Nexora ISP" },
    { name: "description", content: "Lista completa de clientes com filtros por bairro e status." },
    { property: "og:title", content: "Clientes | Nexora ISP" },
    { property: "og:description", content: "Lista completa de clientes com filtros por bairro e status." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Clientes,
});

function Clientes() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [routers, setRouters] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [panel, setPanel] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const listRoutersFn = useServerFn(listRouters);
  const provisionFn = useServerFn(provisionCustomer);

  async function loadData() {
    const [customerResult, planResult] = await Promise.all([
      supabase.from("customers").select("*, plans(name)").order("created_at", { ascending: false }),
      supabase.from("plans").select("*").order("created_at", { ascending: false }),
    ]);
    setCustomers((customerResult.data ?? []) as Customer[]);
    setPlans(planResult.data ?? []);
    try { setRouters(await listRoutersFn()); } catch { setRouters([]); }
  }
  useEffect(() => { void loadData(); }, []);

  const districts = useMemo(() => Array.from(new Set(customers.map(c => c.district).filter((d): d is string => !!d))).sort((a, b) => a.localeCompare(b, "pt-BR")), [customers]);

  const filtered = useMemo(() => customers.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (districtFilter !== "all" && c.district !== districtFilter) return false;
    return `${c.full_name} ${c.document} ${c.pppoe_username ?? ""} ${String(c.ipoe_ip ?? "")} ${c.district ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }), [customers, query, statusFilter, districtFilter]);

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const technology = String(f.get("technology")) as "pppoe" | "ipoe";
    if (technology === "ipoe") {
      const mac = String(f.get("mac") ?? "").trim();
      if (!/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(mac)) { setMessage("Endereço MAC inválido. Use o formato AA:BB:CC:DD:EE:FF."); return; }
      const ip = String(f.get("connection") ?? "").trim();
      if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) { setMessage("Endereço IP inválido. Use o formato 100.64.0.10."); return; }
    }
    const payload = {
      full_name: String(f.get("name")), document: String(f.get("document")), phone: String(f.get("phone")),
      email: String(f.get("email") ?? "") || null, technology,
      plan_id: String(f.get("plan") ?? "") || null, router_id: String(f.get("router") ?? "") || null,
      pppoe_username: technology === "pppoe" ? String(f.get("connection")) : null,
      pppoe_password: technology === "pppoe" ? String(f.get("secret")) || null : null,
      ipoe_ip: technology === "ipoe" ? String(f.get("connection")) : null,
      mac_address: technology === "ipoe" ? String(f.get("mac")).trim().toUpperCase().replace(/-/g, ":") : null,
      notes: String(f.get("notes") ?? "") || null,
      due_day: Number(f.get("due_day")) || null,
      ...addressFromForm(f),
    };
    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert({ ...payload, created_by: user.id });
    if (error) setMessage(error.message);
    else { setPanel(false); setEditing(null); setMessage(""); await loadData(); }
  }

  async function provision(id: string) { setSyncing(id); try { const r = await provisionFn({ data: { id } }); if (!r.ok) alert(r.error); } catch (e) { alert((e as Error).message); } finally { setSyncing(null); await loadData(); } }
  async function setStatus(id: string, status: Customer["status"]) { const { error } = await supabase.from("customers").update({ status }).eq("id", id); if (error) return alert(error.message); await provision(id); }
  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><NavItem icon={<Users />} label="Clientes" active /><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><AdminOnly><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link></AdminOnly><Link to="/equipe"><NavItem icon={<UserPlus />} label="Equipe" /></Link><Link to="/conexoes"><NavItem icon={<Wifi />} label="Conexões" /></Link><Link to="/financeiro"><NavItem icon={<CircleDollarSign />} label="Financeiro" /></Link></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Clientes</p><p className="hidden text-xs text-muted-foreground sm:block">Todos os cadastros, por bairro e status</p></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground sm:flex">{user.email?.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="p-4 md:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm text-muted-foreground">{filtered.length} de {customers.length} clientes</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Todos os clientes</h1></div>
          <Button onClick={() => { setEditing(null); setPanel(true); }}><Plus />Novo cliente</Button>
        </div>
        <section className="mt-7 border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar por nome, documento, acesso ou bairro" value={query} onChange={e => setQuery(e.target.value)} /></div>
            <Select value={districtFilter} onValueChange={setDistrictFilter}><SelectTrigger className="lg:w-56"><SelectValue placeholder="Bairro" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os bairros</SelectItem>{districts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="lg:w-48"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="active">Ativos</SelectItem><SelectItem value="suspended">Suspensos</SelectItem><SelectItem value="pending">Pendentes</SelectItem><SelectItem value="cancelled">Cancelados</SelectItem></SelectContent></Select>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Bairro</TableHead><TableHead>Tecnologia</TableHead><TableHead>Plano</TableHead><TableHead>Acesso</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {filtered.map(c => <TableRow key={c.id}>
                <TableCell><p className="font-semibold">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.document}</p></TableCell>
                <TableCell>{c.district ?? "—"}</TableCell>
                <TableCell><Badge variant="outline">{c.technology.toUpperCase()}</Badge></TableCell>
                <TableCell>{c.plans?.name ?? "Sem plano"}</TableCell>
                <TableCell className="font-mono text-xs">{c.pppoe_username ?? String(c.ipoe_ip ?? "—")}</TableCell>
                <TableCell><Status status={c.status} /><p className={`mt-1 text-xs ${c.sync_status === "error" ? "text-destructive" : "text-muted-foreground"}`} title={c.sync_error ?? ""}>{c.sync_status === "synced" ? "No roteador" : c.sync_status === "error" ? "Falha na sincronização" : "Não provisionado"}</p></TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(c); setPanel(true); }}>Editar</Button>
                  <Button size="sm" variant="ghost" disabled={syncing === c.id || !c.router_id} title={c.router_id ? "Provisionar no MikroTik" : "Sem roteador vinculado"} onClick={() => provision(c.id)}><RefreshCw className={syncing === c.id ? "animate-spin" : ""} />Provisionar</Button>
                  {c.status === "suspended" ? <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "active")}>Reativar</Button> : <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "suspended")}>Suspender</Button>}
                </TableCell>
              </TableRow>)}
              {!filtered.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Nenhum cliente encontrado com esses filtros.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
    {panel && <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">{editing ? "EDITAR CADASTRO" : "NOVO CADASTRO"}</p><h2 className="text-2xl font-extrabold">Cliente</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => { setPanel(false); setEditing(null); }}><X /></Button></div><CustomerForm key={editing?.id ?? "new"} plans={plans} routers={routers} initial={editing} onSubmit={saveCustomer} />{message && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}</div></div>}
  </div>;
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>; }
