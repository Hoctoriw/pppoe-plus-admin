import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cpu, MemoryStick, Thermometer, Users, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { listRouters } from "@/lib/mikrotik.functions";
import { routerStats, type RouterStats } from "@/lib/monitor.functions";

export const Route = createFileRoute("/_authenticated/monitoramento")({
  head: () => ({ meta: [
    { title: "Monitoramento — Syncron ISP" },
    { name: "description", content: "CPU, memória, tráfego dos MikroTik e cadastro de OLTs." },
    { property: "og:title", content: "Monitoramento — Syncron ISP" },
    { property: "og:description", content: "Monitor de rede estilo The Dude no Syncron ISP." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: MonitorPage,
});

const VENDORS = [["vsol", "VSOL"], ["huawei", "Huawei"], ["zte", "ZTE"], ["intelbras", "Intelbras"], ["cdata", "C-Data"], ["fiberhome", "Fiberhome"], ["outra", "Outra"]];
const mbps = (b: number) => (b / 1e6).toFixed(1);

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg border bg-card p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>;
}

function RouterPanel({ id }: { id: string }) {
  const fetchStats = useServerFn(routerStats);
  const [s, setS] = useState<RouterStats | null>(null);
  const [hist, setHist] = useState<number[]>([]);
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (busy.current) return; busy.current = true;
      try { const r = await fetchStats({ data: { id } }); if (alive) { setS(r); if (r.ok) setHist((h) => [...h.slice(-29), r.cpu ?? 0]); } } finally { busy.current = false; }
    };
    tick(); const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  if (!s) return <p className="text-muted-foreground">Carregando…</p>;
  if (!s.ok) return <p className="text-destructive">Sem resposta: {s.error}</p>;
  const mem = s.memTotal ? Math.round((s.memUsed! / s.memTotal) * 100) : 0;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{s.identity} · RouterOS {s.version} · uptime {s.uptime} · atualiza a cada 5s</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${s.cpu}%`} />
      <Card icon={<MemoryStick className="h-4 w-4" />} label="Memória" value={`${mem}%`} />
      <Card icon={<Thermometer className="h-4 w-4" />} label="Temperatura" value={s.temperature != null ? `${s.temperature} °C` : "—"} />
      <Card icon={<Users className="h-4 w-4" />} label="PPPoE ativos" value={String(s.pppActive)} />
    </div>
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 text-sm text-muted-foreground">CPU (últimos 2,5 min)</div>
      <div className="flex h-20 items-end gap-1">{hist.map((v, i) => <div key={i} className="flex-1 rounded-sm bg-primary" style={{ height: `${Math.max(v, 2)}%` }} />)}</div>
    </div>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Interface</th><th className="p-3">Status</th><th className="p-3">Download (Mbps)</th><th className="p-3">Upload (Mbps)</th></tr></thead>
      <tbody>{s.interfaces!.map((i) => <tr key={i.name} className="border-b last:border-0"><td className="p-3 font-medium">{i.name}</td><td className="p-3"><span className={`inline-block h-2.5 w-2.5 rounded-full ${i.running ? "bg-success" : "bg-destructive"}`} /></td><td className="p-3">{mbps(i.rxBps)}</td><td className="p-3">{mbps(i.txBps)}</td></tr>)}</tbody></table>
    </div>
  </div>;
}

type Olt = { id: string; name: string; vendor: string; model: string | null; host: string; snmp_community: string; pon_ports: number };

function OltPanel() {
  const [olts, setOlts] = useState<Olt[]>([]);
  const [f, setF] = useState({ name: "", vendor: "vsol", model: "", host: "", snmp_community: "public", pon_ports: 8 });
  const load = async () => { const { data } = await supabase.from("olts").select("*").order("name"); setOlts((data ?? []) as Olt[]); };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!f.name || !f.host) return toast.error("Informe nome e IP.");
    const { error } = await supabase.from("olts").insert({ ...f, model: f.model || null });
    if (error) return toast.error(error.message);
    toast.success("OLT cadastrada."); setF({ ...f, name: "", host: "", model: "" }); load();
  };
  const del = async (id: string) => { await supabase.from("olts").delete().eq("id", id); load(); };
  return <div className="space-y-4">
    <div className="grid gap-2 rounded-lg border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
      <Input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}>{VENDORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <Input placeholder="Modelo" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} />
      <Input placeholder="IP de gerência" value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} />
      <Input placeholder="Comunidade SNMP" value={f.snmp_community} onChange={(e) => setF({ ...f, snmp_community: e.target.value })} />
      <Button onClick={add}>Adicionar OLT</Button>
    </div>
    <p className="text-sm text-muted-foreground">A leitura de sinal das ONUs (dBm, distância, LOS) será feita pelo servidor local Syncron, que acessa a OLT pela sua rede interna.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{olts.map((o) => <div key={o.id} className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between"><div><div className="font-bold">{o.name}</div><div className="text-sm text-muted-foreground">{VENDORS.find(([v]) => v === o.vendor)?.[1]} {o.model} · {o.host}</div><div className="text-sm text-muted-foreground">{o.pon_ports} portas PON</div></div>
      <Button size="icon" variant="ghost" onClick={() => del(o.id)}><Trash2 className="h-4 w-4" /></Button></div>
    </div>)}{!olts.length && <p className="text-muted-foreground">Nenhuma OLT cadastrada.</p>}</div>
  </div>;
}

function MonitorPage() {
  const fetchRouters = useServerFn(listRouters);
  const [routers, setRouters] = useState<{ id: string; name: string }[]>([]);
  const [sel, setSel] = useState<string>("");
  const [tab, setTab] = useState<"mk" | "olt">("mk");
  useEffect(() => { fetchRouters().then((r) => { setRouters(r); if (r[0]) setSel(r[0].id); }).catch((e) => toast.error(e.message)); }, []);
  return <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
    <div className="flex items-center gap-3"><Link to="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft /></Button></Link><Activity className="text-primary" /><h1 className="text-2xl font-extrabold">Monitoramento</h1></div>
    <div className="flex gap-2"><Button variant={tab === "mk" ? "default" : "outline"} onClick={() => setTab("mk")}>MikroTik</Button><Button variant={tab === "olt" ? "default" : "outline"} onClick={() => setTab("olt")}>OLTs</Button></div>
    {tab === "mk" ? <>
      {routers.length > 1 && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={sel} onChange={(e) => setSel(e.target.value)}>{routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
      {sel ? <RouterPanel key={sel} id={sel} /> : <p className="text-muted-foreground">Cadastre um MikroTik na aba MikroTik.</p>}
    </> : <OltPanel />}
  </div>;
}
