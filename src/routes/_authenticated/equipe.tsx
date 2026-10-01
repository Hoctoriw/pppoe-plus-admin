import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Menu, Package, Plus, Radio, Router as RouterIcon, Search, ShieldCheck, Trash2, UserPlus, Users, Wifi, X, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listTeamUsers, createTeamUser, deleteTeamUser } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminOnly } from "@/components/AdminOnly";
import { NetworkModuleOnly } from "@/components/NetworkModuleOnly";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — Nexora ISP" },
      { name: "description", content: "Cadastre funcionários com acesso aos dados da sua conta no painel Nexora ISP." },
      { property: "og:title", content: "Equipe — Nexora ISP" },
      { property: "og:description", content: "Gerencie os funcionários da sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipePage,
});

type TeamUser = { id: string; full_name: string; email: string; roles: string[]; created_at: string };

const ROLE_LABEL: Record<string, string> = { operator: "Operador", viewer: "Visualizador", admin: "Administrador" };

function EquipePage() {
  const navigate = useNavigate();
  const fetchTeam = useServerFn(listTeamUsers);
  const createFn = useServerFn(createTeamUser);
  const deleteFn = useServerFn(deleteTeamUser);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "operator" as "operator" | "viewer" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setTeam(await fetchTeam());
      setForbidden(false);
    } catch (e) {
      setForbidden(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createFn({ data: form });
      toast.success("Funcionário cadastrado. Ele já pode entrar com o e-mail e a senha definidos.");
      setForm({ fullName: "", email: "", password: "", role: "operator" });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cadastrar funcionário.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(u: TeamUser) {
    if (!confirm(`Remover o acesso de ${u.full_name || u.email}? A conta dele será excluída.`)) return;
    try {
      await deleteFn({ data: { userId: u.id } });
      toast.success("Funcionário removido.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover.");
    }
  }

  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><AdminOnly><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link></AdminOnly><NavItem icon={<UserPlus />} label="Equipe" active /><Link to="/conexoes"><NavItem icon={<Wifi />} label="Conexões" /></Link><NetworkModuleOnly><Link to="/rede"><NavItem icon={<Network />} label="Rede" /></Link></NetworkModuleOnly><Link to="/financeiro"><NavItem icon={<CircleDollarSign />} label="Financeiro" /></Link></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
      {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
      <main className="flex-1 p-6">
        <header className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button>
          <div>
            <h1 className="text-2xl font-extrabold">Equipe</h1>
            <p className="text-sm text-muted-foreground">Funcionários com acesso aos dados da sua conta</p>
          </div>
        </header>

        {forbidden ? (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">Apenas a conta principal pode gerenciar a equipe.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 font-bold">Funcionários</h2>
              {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : team.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum funcionário cadastrado. Use o formulário ao lado para criar o primeiro acesso.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-left text-muted-foreground"><th className="pb-2 pr-4">Nome</th><th className="pb-2 pr-4">E-mail</th><th className="pb-2 pr-4">Função</th><th className="pb-2 pr-4">Desde</th><th className="pb-2" /></tr></thead>
                    <tbody>
                      {team.map((u) => (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{u.full_name || "—"}</td>
                          <td className="py-3 pr-4">{u.email}</td>
                          <td className="py-3 pr-4">{u.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "—"}</td>
                          <td className="py-3 pr-4">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                          <td className="py-3 text-right"><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => remove(u)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="h-fit rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-1 font-bold">Novo funcionário</h2>
              <p className="mb-4 text-xs text-muted-foreground">O funcionário entra com o próprio e-mail e senha e vê somente os dados da sua conta.</p>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Nome completo</Label><Input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Senha</Label><Input required type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                <div>
                  <Label>Função</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "operator" | "viewer" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Operador — cadastra e altera clientes, planos e MikroTik</SelectItem>
                      <SelectItem value="viewer">Visualizador — apenas consulta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={saving}><Plus className="mr-1 h-4 w-4" />{saving ? "Cadastrando…" : "Cadastrar funcionário"}</Button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"}`}>{icon}{label}</div>;
}
