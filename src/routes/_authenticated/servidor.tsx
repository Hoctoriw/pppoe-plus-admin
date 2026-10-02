import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Network, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getServerNetwork, setServerNetwork, type ServerNetwork } from "@/lib/server-network.functions";

export const Route = createFileRoute("/_authenticated/servidor")({
  head: () => ({
    meta: [
      { title: "Rede do servidor — Nexora ISP" },
      { name: "description", content: "Altere o IP, gateway e DNS do servidor local Nexora." },
      { property: "og:title", content: "Rede do servidor — Nexora ISP" },
      { property: "og:description", content: "Configuração de IP do servidor local." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServidorPage,
});

function ServidorPage() {
  const get = useServerFn(getServerNetwork);
  const set = useServerFn(setServerNetwork);
  const [net, setNet] = useState<ServerNetwork | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"dhcp" | "static">("static");
  const [f, setF] = useState({ ip: "", prefix: "24", gateway: "", dns1: "1.1.1.1", dns2: "8.8.8.8" });
  const [busy, setBusy] = useState(false);

  const load = () => get().then((n) => {
    setNet(n);
    if (n.ip && !f.ip) setF((x) => ({ ...x, ip: n.ip, prefix: n.cidr || "24", gateway: n.gateway, dns1: n.dns[0] ?? x.dns1, dns2: n.dns[1] ?? "" }));
    if (n.mode === "dhcp") setMode("dhcp");
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function apply() {
    setErr(""); setMsg("");
    if (!window.confirm("Aplicar a nova configuração de rede? A conexão pode cair por alguns segundos.")) return;
    setBusy(true);
    try {
      if (mode === "dhcp") await set({ data: { mode: "dhcp" } });
      else await set({ data: { mode: "static", ip: f.ip, prefix: Number(f.prefix), gateway: f.gateway, dns1: f.dns1, dns2: f.dns2 } });
      const target = mode === "static" ? `http://${f.ip}/servidor` : "";
      setMsg(mode === "static" ? `Aplicando em até 10 segundos. Novo endereço: http://${f.ip}/` : "Aplicando DHCP. Veja o novo IP na tela da máquina.");
      if (target) setTimeout(() => { window.location.href = target; }, 15000);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Network />Rede do servidor</h1>
      {err && <p className="rounded-md border border-destructive p-3 text-sm text-destructive">{err}</p>}
      {net && !net.available && <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">Esta opção funciona apenas no servidor local instalado pela ISO.</p>}
      {net?.available && (
        <>
          <section className="rounded-lg border border-border p-4 text-sm">
            <div className="mb-2 flex items-center justify-between"><strong>Situação atual</strong><Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button></div>
            <p>Placa: {net.iface || "—"} · Modo: {net.mode === "dhcp" ? "Automático (DHCP)" : "IP fixo"}</p>
            <p>IP: {net.ip ? `${net.ip}/${net.cidr}` : "—"} · Gateway: {net.gateway || "—"}</p>
            <p>DNS: {net.dns.join(", ") || "—"}</p>
            {net.pending && <p className="mt-2 text-primary">Alteração aguardando aplicação…</p>}
            {net.lastResult && <p className="mt-2 text-muted-foreground">Última alteração: {net.lastResult}</p>}
          </section>
          <section className="space-y-4 rounded-lg border border-border p-4">
            <div className="flex gap-2">
              <Button variant={mode === "static" ? "default" : "outline"} onClick={() => setMode("static")}>IP fixo</Button>
              <Button variant={mode === "dhcp" ? "default" : "outline"} onClick={() => setMode("dhcp")}>Automático (DHCP)</Button>
            </div>
            {mode === "static" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Endereço IP<Input value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} placeholder="192.168.1.100" /></label>
                <label className="text-sm">Máscara (CIDR)<Input value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} placeholder="24" /></label>
                <label className="text-sm">Gateway<Input value={f.gateway} onChange={(e) => setF({ ...f, gateway: e.target.value })} placeholder="192.168.1.1" /></label>
                <label className="text-sm">DNS primário<Input value={f.dns1} onChange={(e) => setF({ ...f, dns1: e.target.value })} /></label>
                <label className="text-sm">DNS secundário<Input value={f.dns2} onChange={(e) => setF({ ...f, dns2: e.target.value })} /></label>
              </div>
            )}
            <Button onClick={apply} disabled={busy}>Aplicar</Button>
            {msg && <p className="text-sm text-primary">{msg}</p>}
            <p className="text-xs text-muted-foreground">Máscara 24 = 255.255.255.0. Se errar o IP, entre na tela da máquina como root e rode: nexora-ip dhcp</p>
          </section>
        </>
      )}
    </main>
  );
}
