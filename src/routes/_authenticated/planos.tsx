import { AdminOnly } from "@/components/AdminOnly";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Menu, Package, Plus, Radio, UserPlus, UserPlus, Router as RouterIcon, Search, ShieldCheck, Trash2, Users, Wifi, X } from "lucide-react";
import { listRouters, syncPlans } from "@/lib/mikrotik.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "./dashboard";

export const Route = createFileRoute("/_authenticated/planos")({
  head: () => ({ meta: [
    { title: "Planos | Nexora ISP" },
    { name: "description", content: "Gestão de planos de internet: velocidades, preços e sincronização com o MikroTik." },
    { property: "og:title", content: "Planos | Nexora ISP" },
    { property: "og:description", content: "Gestão de planos de internet: velocidades, preços e sincronização com o MikroTik." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Planos,
});

function Planos() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const listRoutersFn = useServerFn(listRouters);
  const syncPlansFn = useServerFn(syncPlans);

  async function loadData() {
    const { data } = await supabase.from("plans").select("*").order("created_at", { ascending: false });
    setPlans(data ?? []);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    void roles; setIsAdmin(true); // cada usuário é dono do próprio painel
  }
  useEffect(() => { void loadData(); }, []);

  const filtered = plans.filter(p => p.name.toLowerCase().includes(query.toLowerCase()));

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const payload = {
      name: String(f.get("name")),
      download_mbps: Number(f.get("down")),
      upload_mbps: Number(f.get("up")),
      monthly_price: Number(f.get("price")),
      description: String(f.get("description") ?? "") || null,
      status: String(f.get("status") ?? "active") as Plan["status"],
    };
    const { error } = editing
      ? await supabase.from("plans").update(payload).eq("id", editing.id)
      : await supabase.from("plans").insert(payload);
    if (error) setMessage(error.message);
    else { setPanel(false); setEditing(null); setMessage(""); await loadData(); }
  }

  async function removePlan(id: string) {
    if (!confirm("Excluir este plano? Clientes vinculados ficarão sem plano.")) return;
    const { error } = await supabase.from("plans").delete().eq("id", id);
    if (error) return alert(error.message);
    await loadData();
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const routers = await listRoutersFn();
      if (!routers.length) { alert("Nenhum roteador cadastrado. Cadastre um na página MikroTik."); return; }
      for (const r of routers) { try { await syncPlansFn({ data: { routerId: r.id } }); } catch (e) { alert(`${r.name}: ${(e as Error).message}`); } }
    } catch (e) { alert((e as Error).message); } finally { setSyncing(false); }
  }

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><NavItem icon={<Package />} label="Planos" active /><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><AdminOnly><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link></AdminOnly><Link to="/equipe"><NavItem icon={<UserPlus />} label="Equipe" /></Link><NavItem icon={<Wifi />} label="Conexões" /><Link to="/financeiro"><NavItem icon={<CircleDollarSign />} label="Financeiro" /></Link></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Planos</p><p className="hidden text-xs text-muted-foreground sm:block">Velocidades, preços e sincronização com o MikroTik</p></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground sm:flex">{user.email?.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="p-4 md:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="text-sm text-muted-foreground">{plans.length} planos cadastrados</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Planos de internet</h1></div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={syncing} onClick={syncAll}>{syncing ? "Sincronizando..." : "Sincronizar com MikroTik"}</Button>
            <Button onClick={() => { setEditing(null); setPanel(true); }}><Plus />Novo plano</Button>
          </div>
        </div>
        <section className="mt-7 border bg-card">
          <div className="flex items-center gap-3 border-b p-4">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar plano" value={query} onChange={e => setQuery(e.target.value)} /></div>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Plano</TableHead><TableHead>Download</TableHead><TableHead>Upload</TableHead><TableHead>Mensalidade</TableHead><TableHead>Status</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {filtered.map(p => <TableRow key={p.id}>
                <TableCell><p className="font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.description ?? ""}</p></TableCell>
                <TableCell>{p.download_mbps} Mbps</TableCell>
                <TableCell>{p.upload_mbps} Mbps</TableCell>
                <TableCell>{p.monthly_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</TableCell>
                <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status === "active" ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(p); setPanel(true); }}>Editar</Button>
                  {isAdmin && <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => removePlan(p.id)}><Trash2 /></Button>}
                </TableCell>
              </TableRow>)}
              {!filtered.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhum plano encontrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </main>
    {panel && <div className="fixed inset-0 z-50 flex justify-end bg-foreground/30"><div className="h-full w-full max-w-lg overflow-y-auto bg-card p-6 shadow-xl"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-primary">{editing ? "EDITAR PLANO" : "NOVO PLANO"}</p><h2 className="text-2xl font-extrabold">Plano</h2></div><Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => { setPanel(false); setEditing(null); }}><X /></Button></div>
      <form key={editing?.id ?? "new"} className="mt-6 space-y-4" onSubmit={savePlan}>
        <div><Label htmlFor="name">Nome do plano</Label><Input id="name" name="name" required defaultValue={editing?.name ?? ""} placeholder="Fibra 300" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="down">Download (Mbps)</Label><Input id="down" name="down" type="number" min={1} required defaultValue={editing?.download_mbps ?? ""} /></div>
          <div><Label htmlFor="up">Upload (Mbps)</Label><Input id="up" name="up" type="number" min={1} required defaultValue={editing?.upload_mbps ?? ""} /></div>
        </div>
        <div><Label htmlFor="price">Mensalidade (R$)</Label><Input id="price" name="price" type="number" step="0.01" min={0} required defaultValue={editing?.monthly_price ?? ""} /></div>
        <div><Label htmlFor="description">Descrição</Label><Input id="description" name="description" defaultValue={editing?.description ?? ""} placeholder="Opcional" /></div>
        {editing && <div><Label htmlFor="status">Status</Label><select id="status" name="status" defaultValue={editing.status} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></div>}
        <Button type="submit" className="w-full">{editing ? "Salvar alterações" : "Cadastrar plano"}</Button>
      </form>
      {message && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}</div></div>}
  </div>;
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) { return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>; }
