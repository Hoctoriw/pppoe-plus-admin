import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Bell, ChevronRight, CircleDollarSign, Crosshair, LayoutDashboard, LocateFixed, LogOut, MapPin, Menu, Package, Radio, Router as RouterIcon, Search, ShieldCheck, UserPlus, Users, Wifi, X } from "lucide-react";
import { AdminOnly } from "@/components/AdminOnly";
import { ConnectionsMap } from "@/components/ConnectionsMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { geocodeCustomerAddress, listConnectionCustomers, saveCustomerCoordinates, type ConnectionCustomer } from "@/lib/connections.functions";

export const Route = createFileRoute("/_authenticated/conexoes")({
  head: () => ({ meta: [
    { title: "Conexões e mapa | Nexora ISP" },
    { name: "description", content: "Tecnologia, acesso e localização das residências dos clientes no mapa da rede." },
    { property: "og:title", content: "Conexões e mapa | Nexora ISP" },
    { property: "og:description", content: "Tecnologia, acesso e localização das residências dos clientes no mapa da rede." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: ConnectionsPage,
});

type Customer = ConnectionCustomer;
type LocatedCustomer = Customer & { latitude: number; longitude: number };

const STATUS_LABEL = { active: "Ativo", suspended: "Suspenso", pending: "Pendente", cancelled: "Cancelado" } as const;

function addressOf(customer: Customer) {
  return [customer.street && `${customer.street}${customer.address_number ? `, ${customer.address_number}` : ""}`, customer.district, customer.city && customer.state ? `${customer.city} - ${customer.state}` : customer.city ?? customer.state, customer.postal_code && `CEP ${customer.postal_code}`].filter(Boolean).join(" · ");
}

function ConnectionsPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const list = useServerFn(listConnectionCustomers);
  const geocode = useServerFn(geocodeCustomerAddress);
  const saveCoordinates = useServerFn(saveCustomerCoordinates);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [technology, setTechnology] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    try { setCustomers(await list()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível carregar os clientes."); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => customers.filter((customer) => {
    if (technology !== "all" && customer.technology !== technology) return false;
    return `${customer.full_name} ${customer.pppoe_username ?? ""} ${String(customer.ipoe_ip ?? "")} ${addressOf(customer)}`.toLowerCase().includes(query.toLowerCase());
  }), [customers, query, technology]);
  const located = filtered.filter((customer): customer is LocatedCustomer => customer.latitude !== null && customer.longitude !== null);
  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  async function locate(customer: Customer) {
    setBusyId(customer.id); setMessage("");
    try {
      const result = await geocode({ data: { customerId: customer.id } });
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, latitude: result.latitude, longitude: result.longitude } : item));
      setSelectedId(customer.id);
      setMessage(`Residência localizada: ${result.formattedAddress}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível localizar o endereço."); }
    finally { setBusyId(null); }
  }

  async function moveSelected(latitude: number, longitude: number) {
    if (!selectedId) return;
    const selectedCustomer = customers.find((customer) => customer.id === selectedId);
    if (!selectedCustomer || !confirm(`Mover o ponto de ${selectedCustomer.full_name} para este local?`)) return;
    setBusyId(selectedId); setMessage("");
    try {
      await saveCoordinates({ data: { customerId: selectedId, latitude, longitude } });
      setCustomers((current) => current.map((item) => item.id === selectedId ? { ...item, latitude, longitude } : item));
      setMessage("Localização ajustada no mapa.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a localização."); }
    finally { setBusyId(null); }
  }

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><AdminOnly><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link></AdminOnly><Link to="/equipe"><NavItem icon={<UserPlus />} label="Equipe" /></Link><NavItem icon={<Wifi />} label="Conexões" active /><Link to="/financeiro"><NavItem icon={<CircleDollarSign />} label="Financeiro" /></Link></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Conexões</p><p className="hidden text-xs text-muted-foreground sm:block">Tecnologia e localização da rede</p></div><div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Notificações"><Bell /></Button><div className="hidden h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground sm:flex">{user.email?.slice(0, 2).toUpperCase()}</div></div></header>
      <div className="p-4 md:p-7">
        <div><p className="text-sm text-muted-foreground">{located.length} residências no mapa · {customers.length - customers.filter(c => c.latitude !== null).length} sem localização</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Mapa da rede</h1></div>
        {message && <p className="mt-4 border bg-card p-3 text-sm">{message}</p>}
        <section className="mt-6 grid min-h-[650px] overflow-hidden border bg-card lg:grid-cols-[380px_1fr]">
          <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b p-4">
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar cliente, acesso ou endereço" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
              <Select value={technology} onValueChange={setTechnology}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as tecnologias</SelectItem><SelectItem value="pppoe">PPPoE</SelectItem><SelectItem value="ipoe">IPoE</SelectItem></SelectContent></Select>
            </div>
            <div className="max-h-[560px] divide-y overflow-y-auto">
              {filtered.map((customer) => <button type="button" key={customer.id} onClick={() => setSelectedId(customer.id)} className={`w-full p-4 text-left transition-colors hover:bg-muted ${selectedId === customer.id ? "bg-accent" : ""}`}>
                <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${customer.latitude === null ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}><MapPin className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{customer.full_name}</p><Badge variant="outline">{customer.technology.toUpperCase()}</Badge></div><p className="mt-1 font-mono text-xs text-muted-foreground">{customer.pppoe_username ?? String(customer.ipoe_ip ?? "Sem identificação")}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{addressOf(customer) || "Endereço não cadastrado"}</p><div className="mt-2 flex items-center justify-between"><span className="text-xs">{STATUS_LABEL[customer.status]}</span>{customer.latitude === null && <Button size="sm" variant="outline" disabled={busyId === customer.id} onClick={(event) => { event.stopPropagation(); void locate(customer); }}><LocateFixed />{busyId === customer.id ? "Localizando" : "Localizar"}</Button>}</div></div></div>
              </button>)}
              {!filtered.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>
          </div>
          <div className="relative min-h-[480px]">
            <ConnectionsMap points={located.map((customer) => ({ id: customer.id, name: customer.full_name, latitude: customer.latitude, longitude: customer.longitude, status: customer.status }))} selectedId={selectedId} onSelect={setSelectedId} onMoveSelected={(lat, lng) => void moveSelected(lat, lng)} />
            <div className="absolute bottom-4 left-4 right-4 border bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:right-auto sm:max-w-sm">
              {selected ? <><div className="flex items-center gap-2"><Crosshair className="h-4 w-4 text-primary" /><p className="font-semibold">{selected.full_name}</p></div><p className="mt-1 text-xs text-muted-foreground">{selected.latitude === null ? "Localize o endereço para adicionar ao mapa." : "Clique no mapa para ajustar o ponto exato da residência."}</p>{selected.latitude === null && <Button className="mt-3 w-full" size="sm" disabled={busyId === selected.id} onClick={() => void locate(selected)}><LocateFixed />Localizar pelo endereço</Button>}</> : <p className="text-sm text-muted-foreground">Selecione um cliente para ver ou ajustar sua residência.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>;
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>;
}