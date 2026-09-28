import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Box, Cable, ChevronRight, CircleDollarSign, LayoutDashboard, LogOut, Menu, Move, Network, Package, Plus, Radio, Router as RouterIcon, Save, Server, ShieldCheck, Split, Trash2, UserPlus, Users, Wifi, X } from "lucide-react";
import { AdminOnly } from "@/components/AdminOnly";
import { NetworkMap, type MapCustomer } from "@/components/NetworkMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { computeSignals, CONNECTOR_DB, customerSignal, distanceM, fmtDbm, FIBER_DB_PER_KM, FUSION_DB, MIN_SIGNAL_DBM, NODE_LABEL, SPLITTER_LOSS, type FtthNode, type NodeType } from "@/lib/ftth";

export const Route = createFileRoute("/_authenticated/rede")({
  head: () => ({ meta: [
    { title: "Rede FTTH | Nexora ISP" },
    { name: "description", content: "Desenhe a rede FTTH no mapa com OLT, caixas de emenda, CTOs, splitters, cabos e cálculo de sinal." },
    { property: "og:title", content: "Rede FTTH | Nexora ISP" },
    { property: "og:description", content: "Desenhe a rede FTTH no mapa com OLT, caixas de emenda, CTOs, splitters, cabos e cálculo de sinal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: NetworkPage,
});

type Cust = { id: string; full_name: string; latitude: number | null; longitude: number | null; cto_id: string | null; cto_port: number | null };
const db = supabase as any;
const DEFAULTS: Record<NodeType, Partial<FtthNode>> = {
  olt: { tx_power_dbm: 5, splitter_ratio: 1, connector_count: 1, fusion_count: 0, ports: 16 },
  ceo: { splitter_ratio: 1, connector_count: 0, fusion_count: 2, ports: 0 },
  cto: { splitter_ratio: 8, connector_count: 2, fusion_count: 2, ports: 8 },
};

function NetworkPage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [owner, setOwner] = useState<string>(user.id);
  const [nodes, setNodes] = useState<FtthNode[]>([]);
  const [customers, setCustomers] = useState<Cust[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<NodeType | "move" | null>(null);
  const [draft, setDraft] = useState<FtthNode | null>(null);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  async function load() {
    const [n, c, r] = await Promise.all([
      db.from("ftth_nodes").select("*").order("created_at"),
      db.from("customers").select("id, full_name, latitude, longitude, cto_id, cto_port").order("full_name"),
      db.from("user_roles").select("owner_id").eq("user_id", user.id).not("owner_id", "is", null).maybeSingle(),
    ]);
    if (n.error) setMessage(n.error.message);
    setNodes((n.data ?? []).map((x: any) => ({ ...x, tx_power_dbm: Number(x.tx_power_dbm), cable_length_m: x.cable_length_m === null ? null : Number(x.cable_length_m) })));
    setCustomers(c.data ?? []);
    if (r.data?.owner_id) setOwner(r.data.owner_id);
  }
  useEffect(() => { void load(); }, []);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  useEffect(() => { setDraft(selected ? { ...selected } : null); }, [selectedId, nodes]);

  const signals = useMemo(() => computeSignals(nodes), [nodes]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const custSignal = (c: Cust) => {
    const cto = c.cto_id ? byId.get(c.cto_id) : undefined;
    if (!cto) return null;
    const drop = c.latitude !== null && c.longitude !== null ? distanceM(cto, { latitude: c.latitude, longitude: c.longitude }) : 0;
    return customerSignal(signals.get(cto.id)?.output ?? null, drop);
  };
  const mapCustomers: MapCustomer[] = customers.filter((c) => c.latitude !== null && c.longitude !== null).map((c) => {
    const s = custSignal(c);
    return { id: c.id, name: c.full_name, latitude: c.latitude!, longitude: c.longitude!, cto_id: c.cto_id, weak: s !== null && s < MIN_SIGNAL_DBM };
  });

  async function handleMapClick(lat: number, lng: number) {
    if (!placing) return;
    if (placing === "move") {
      if (!selected) return;
      const { error } = await db.from("ftth_nodes").update({ latitude: lat, longitude: lng }).eq("id", selected.id);
      setPlacing(null);
      if (error) return setMessage(error.message);
      setNodes((cur) => cur.map((n) => n.id === selected.id ? { ...n, latitude: lat, longitude: lng } : n));
      return setMessage("Ponto movido.");
    }
    const type = placing;
    const count = nodes.filter((n) => n.node_type === type).length + 1;
    const parent = type !== "olt" && selected ? selected.id : null;
    const row = { ...DEFAULTS[type], owner_id: owner, node_type: type, name: `${type.toUpperCase()}-${String(count).padStart(2, "0")}`, latitude: lat, longitude: lng, parent_id: parent, cable_fibers: type === "olt" ? null : 12 };
    const { data, error } = await db.from("ftth_nodes").insert(row).select().single();
    setPlacing(null);
    if (error) return setMessage(error.message);
    await load();
    setSelectedId(data.id);
    setMessage(`${NODE_LABEL[type]} criada${parent ? ` e ligada a ${selected?.name}` : ""}. Ajuste os detalhes ao lado.`);
  }

  async function save() {
    if (!draft) return;
    const { id, owner_id: _o, ...rest } = draft;
    const { error } = await db.from("ftth_nodes").update({ ...rest, parent_id: draft.node_type === "olt" ? null : draft.parent_id }).eq("id", id);
    if (error) return setMessage(error.message);
    await load(); setMessage("Alterações salvas.");
  }
  async function remove() {
    if (!selected || !confirm(`Excluir ${selected.name}? Caixas ligadas a ela ficarão sem origem.`)) return;
    const { error } = await db.from("ftth_nodes").delete().eq("id", selected.id);
    if (error) return setMessage(error.message);
    setSelectedId(null); await load();
  }
  async function assignPort(port: number, customerId: string) {
    if (!selected) return;
    const old = customers.find((c) => c.cto_id === selected.id && c.cto_port === port);
    if (old) await db.from("customers").update({ cto_id: null, cto_port: null }).eq("id", old.id);
    if (customerId !== "none") {
      const { error } = await db.from("customers").update({ cto_id: selected.id, cto_port: port }).eq("id", customerId);
      if (error) setMessage(error.message);
    }
    await load();
  }

  const set = <K extends keyof FtthNode>(k: K, v: FtthNode[K]) => setDraft((d) => d ? { ...d, [k]: v } : d);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const weakCount = customers.filter((c) => { const s = custSignal(c); return s !== null && s < MIN_SIGNAL_DBM; }).length;

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); }
  const nav = <><div className="flex h-16 items-center gap-3 px-5 text-lg font-extrabold"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><Radio /></span>NEXORA <span className="text-sidebar-primary">ISP</span></div><nav className="mt-5 space-y-1 px-3"><Link to="/dashboard"><NavItem icon={<LayoutDashboard />} label="Visão geral" /></Link><Link to="/clientes"><NavItem icon={<Users />} label="Clientes" /></Link><Link to="/planos"><NavItem icon={<Package />} label="Planos" /></Link><Link to="/mikrotik"><NavItem icon={<RouterIcon />} label="MikroTik" /></Link><AdminOnly><Link to="/usuarios"><NavItem icon={<ShieldCheck />} label="Usuários" /></Link></AdminOnly><Link to="/equipe"><NavItem icon={<UserPlus />} label="Equipe" /></Link><Link to="/conexoes"><NavItem icon={<Wifi />} label="Conexões" /></Link><NavItem icon={<Network />} label="Rede" active /><Link to="/financeiro"><NavItem icon={<CircleDollarSign />} label="Financeiro" /></Link></nav><div className="mt-auto border-t border-sidebar-border p-3"><Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={signOut}><LogOut />Sair</Button></div></>;

  const sig = selected ? signals.get(selected.id) : undefined;
  const parentOptions = draft ? nodes.filter((n) => n.id !== draft.id && n.node_type !== "cto") : [];

  return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="hidden min-h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">{nav}</aside>
    {mobileNav && <div className="fixed inset-0 z-50 flex bg-foreground/30 lg:hidden"><aside className="flex w-64 flex-col bg-sidebar text-sidebar-foreground">{nav}</aside><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={() => setMobileNav(false)}><X /></Button></div>}
    <main className="min-w-0">
      <header className="flex h-16 items-center gap-3 border-b bg-card px-4 md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu /></Button><div><p className="font-bold">Rede</p><p className="hidden text-xs text-muted-foreground sm:block">Projeto FTTH no mapa</p></div></header>
      <div className="p-4 md:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-sm text-muted-foreground">{nodes.filter(n => n.node_type === "olt").length} OLT · {nodes.filter(n => n.node_type === "ceo").length} CEO · {nodes.filter(n => n.node_type === "cto").length} CTO · {customers.filter(c => c.cto_id).length} clientes ligados{weakCount ? ` · ${weakCount} com sinal fraco` : ""}</p><h1 className="mt-1 text-2xl font-extrabold md:text-3xl">Rede FTTH</h1></div>
          <div className="flex flex-wrap gap-2">
            <Button variant={placing === "olt" ? "default" : "outline"} onClick={() => setPlacing(placing === "olt" ? null : "olt")}><Server />OLT</Button>
            <Button variant={placing === "ceo" ? "default" : "outline"} onClick={() => setPlacing(placing === "ceo" ? null : "ceo")}><Box />CEO</Button>
            <Button variant={placing === "cto" ? "default" : "outline"} onClick={() => setPlacing(placing === "cto" ? null : "cto")}><Split />CTO</Button>
          </div>
        </div>
        {placing && <p className="mt-4 border border-primary bg-primary/10 p-3 text-sm">{placing === "move" ? `Clique no mapa para a nova posição de ${selected?.name}.` : `Clique no mapa para posicionar a ${NODE_LABEL[placing]}.${placing !== "olt" && selected ? ` Ela será ligada por cabo a ${selected.name}.` : placing !== "olt" ? " Dica: selecione antes a caixa de origem para ligar o cabo automaticamente." : ""}`} <button className="ml-2 underline" onClick={() => setPlacing(null)}>Cancelar</button></p>}
        {message && !placing && <p className="mt-4 border bg-card p-3 text-sm">{message}</p>}

        <section className="mt-6 grid overflow-hidden border bg-card lg:grid-cols-[1fr_400px]">
          <div className="relative min-h-[520px] lg:min-h-[720px]">
            <NetworkMap nodes={nodes} customers={mapCustomers} selectedId={selectedId} placing={!!placing} onSelect={(id) => { setSelectedId(id); setPlacing(null); }} onMapClick={(a, b) => void handleMapClick(a, b)} />
            <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 border bg-card/95 px-3 py-2 text-xs shadow backdrop-blur-sm">
              <span className="flex items-center gap-1"><span className="h-3 w-3 bg-ftth-olt" />OLT</span><span className="flex items-center gap-1"><span className="h-3 w-3 bg-ftth-ceo" />CEO</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-ftth-cto" />CTO</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-map-active" />Cliente</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-map-suspended" />Sinal fraco</span>
            </div>
          </div>

          <div className="max-h-[720px] overflow-y-auto border-t lg:border-l lg:border-t-0">
            {!draft ? <div className="divide-y">
              <p className="p-4 text-sm text-muted-foreground">Escolha OLT, CEO ou CTO e clique no mapa para criar. Clique num elemento para editar.</p>
              {nodes.map((n) => { const s = signals.get(n.id); return <button key={n.id} onClick={() => setSelectedId(n.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted">
                <span className={`h-3 w-3 shrink-0 ${n.node_type === "cto" ? "rounded-full" : ""} bg-ftth-${n.node_type}`} />
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{n.name}</p><p className="text-xs text-muted-foreground">{NODE_LABEL[n.node_type]}{n.splitter_ratio > 1 ? ` · 1:${n.splitter_ratio}` : ""}{n.parent_id ? ` · de ${byId.get(n.parent_id)?.name ?? "?"}` : ""}</p></div>
                <span className={`font-mono text-xs ${s?.output !== null && s?.output !== undefined && s.output < MIN_SIGNAL_DBM ? "text-destructive" : ""}`}>{fmtDbm(s?.output ?? null)}</span>
              </button>; })}
              <div className="p-4 text-xs text-muted-foreground">Perdas usadas: fibra {FIBER_DB_PER_KM} dB/km · fusão {FUSION_DB} dB · conector {CONNECTOR_DB} dB · splitter 1:2 {SPLITTER_LOSS[2]} / 1:4 {SPLITTER_LOSS[4]} / 1:8 {SPLITTER_LOSS[8]} / 1:16 {SPLITTER_LOSS[16]} / 1:32 {SPLITTER_LOSS[32]} dB. Limite de sinal: {MIN_SIGNAL_DBM} dBm.</div>
            </div> : <div className="space-y-4 p-4">
              <div className="flex items-center justify-between"><Badge variant="outline">{NODE_LABEL[draft.node_type]}</Badge><Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}><X />Fechar</Button></div>
              <div className="grid grid-cols-2 gap-2 border bg-muted/40 p-3 text-sm">
                {draft.node_type !== "olt" && <div><p className="text-xs text-muted-foreground">Sinal chegando</p><p className="font-mono font-semibold">{fmtDbm(sig?.input ?? null)}</p></div>}
                <div><p className="text-xs text-muted-foreground">Sinal na saída</p><p className={`font-mono font-semibold ${sig?.output != null && sig.output < MIN_SIGNAL_DBM ? "text-destructive" : ""}`}>{fmtDbm(sig?.output ?? null)}</p></div>
                {draft.node_type !== "olt" && <div><p className="text-xs text-muted-foreground">Cabo</p><p className="font-mono">{Math.round(sig?.cableM ?? 0)} m</p></div>}
                <div><p className="text-xs text-muted-foreground">Perda na caixa</p><p className="font-mono">{((SPLITTER_LOSS[draft.splitter_ratio] ?? 0) + draft.fusion_count * FUSION_DB + draft.connector_count * CONNECTOR_DB).toFixed(2)} dB</p></div>
              </div>
              {draft.node_type !== "olt" && sig?.input === null && <p className="flex gap-2 text-xs text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />Ligue esta caixa a uma OLT ou CEO para calcular o sinal.</p>}
              <Field label="Nome"><Input value={draft.name} onChange={(e) => set("name", e.target.value)} /></Field>
              {draft.node_type !== "olt" && <Field label="Vem de (origem do cabo)"><Select value={draft.parent_id ?? "none"} onValueChange={(v) => set("parent_id", v === "none" ? null : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem origem</SelectItem>{parentOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.node_type.toUpperCase()})</SelectItem>)}</SelectContent></Select></Field>}
              <div className="grid grid-cols-2 gap-3">
                {draft.node_type === "olt" ? <><Field label="Potência de saída (dBm)"><Input type="number" step="0.1" value={draft.tx_power_dbm} onChange={(e) => set("tx_power_dbm", num(e.target.value))} /></Field><Field label="Portas PON"><Input type="number" min={0} value={draft.ports} onChange={(e) => set("ports", num(e.target.value))} /></Field></>
                  : <Field label="Porta PON da OLT"><Input type="number" min={1} value={draft.pon_port ?? ""} onChange={(e) => set("pon_port", e.target.value === "" ? null : Number(e.target.value))} /></Field>}
                <Field label="Splitter"><Select value={String(draft.splitter_ratio)} onValueChange={(v) => { set("splitter_ratio", Number(v)); if (draft.node_type === "cto") set("ports", Number(v) > 1 ? Number(v) : draft.ports); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 4, 8, 16, 32, 64].map((r) => <SelectItem key={r} value={String(r)}>{r === 1 ? "Sem splitter" : `1:${r} (${SPLITTER_LOSS[r]} dB)`}</SelectItem>)}</SelectContent></Select></Field>
                <Field label="Fusões"><Input type="number" min={0} value={draft.fusion_count} onChange={(e) => set("fusion_count", num(e.target.value))} /></Field>
                <Field label="Conectores"><Input type="number" min={0} value={draft.connector_count} onChange={(e) => set("connector_count", num(e.target.value))} /></Field>
                {draft.node_type === "cto" && <Field label="Portas de atendimento"><Input type="number" min={0} max={64} value={draft.ports} onChange={(e) => set("ports", Math.min(64, num(e.target.value)))} /></Field>}
                {draft.node_type !== "olt" && <><Field label="Fibras do cabo"><Input type="number" min={1} value={draft.cable_fibers ?? ""} onChange={(e) => set("cable_fibers", e.target.value === "" ? null : Number(e.target.value))} /></Field><Field label="Metragem do cabo (m)"><Input type="number" min={0} placeholder={`Auto: ${Math.round(sig?.cableM ?? 0)}`} value={draft.cable_length_m ?? ""} onChange={(e) => set("cable_length_m", e.target.value === "" ? null : Number(e.target.value))} /></Field></>}
              </div>
              <Field label="Observações"><Input value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} /></Field>
              <div className="flex flex-wrap gap-2"><Button onClick={() => void save()}><Save />Salvar</Button><Button variant="outline" onClick={() => setPlacing("move")}><Move />Mover</Button>{draft.node_type !== "cto" && <><Button variant="outline" onClick={() => setPlacing("ceo")}><Plus />CEO aqui</Button><Button variant="outline" onClick={() => setPlacing("cto")}><Plus />CTO aqui</Button></>}<Button variant="ghost" className="text-destructive" onClick={() => void remove()}><Trash2 />Excluir</Button></div>

              {draft.node_type === "cto" && selected && <div className="border-t pt-4">
                <p className="mb-2 flex items-center gap-2 font-semibold"><Cable className="h-4 w-4" />Portas ({customers.filter(c => c.cto_id === selected.id).length}/{selected.ports} ocupadas)</p>
                <div className="space-y-2">{Array.from({ length: selected.ports }, (_, i) => i + 1).map((port) => {
                  const c = customers.find((x) => x.cto_id === selected.id && x.cto_port === port);
                  const s = c ? custSignal(c) : null;
                  return <div key={port} className="flex items-center gap-2"><span className="w-8 font-mono text-xs">P{port}</span>
                    <Select value={c?.id ?? "none"} onValueChange={(v) => void assignPort(port, v)}><SelectTrigger className="h-9 flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Livre</SelectItem>{customers.filter((x) => !x.cto_id || x.id === c?.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>)}</SelectContent></Select>
                    <span className={`w-24 text-right font-mono text-xs ${s !== null && s < MIN_SIGNAL_DBM ? "text-destructive" : "text-muted-foreground"}`}>{c ? fmtDbm(s) : ""}</span></div>;
                })}</div>
                <p className="mt-2 text-xs text-muted-foreground">O sinal do cliente considera o cabo drop até a residência marcada em Conexões.</p>
              </div>}
            </div>}
          </div>
        </section>
      </div>
    </main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return <div className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50"}`}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto h-4 w-4" />}</div>;
}
