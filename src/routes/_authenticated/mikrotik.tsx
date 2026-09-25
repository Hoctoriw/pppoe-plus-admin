import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Plus, RefreshCw, Router as RouterIcon, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connectionStatus, deleteRouter, listRouters, saveRouter, syncPlans, testRouter } from "@/lib/mikrotik.functions";

export const Route = createFileRoute("/_authenticated/mikrotik")({
  head: () => ({ meta: [
    { title: "MikroTik | Nexora ISP" },
    { name: "description", content: "Roteadores MikroTik, sincronização de planos e conexões ativas." },
    { property: "og:title", content: "MikroTik | Nexora ISP" },
    { property: "og:description", content: "Roteadores MikroTik, sincronização de planos e conexões ativas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: MikrotikPage,
});

type RouterRow = Awaited<ReturnType<typeof listRouters>>[number];
type Status = Awaited<ReturnType<typeof connectionStatus>>;

function MikrotikPage() {
  const list = useServerFn(listRouters), save = useServerFn(saveRouter), del = useServerFn(deleteRouter);
  const test = useServerFn(testRouter), sync = useServerFn(syncPlans), status = useServerFn(connectionStatus);
  const [routers, setRouters] = useState<RouterRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [conn, setConn] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"vpn" | "public_ip">("public_ip");
  const shown = routers.filter(r => (r.connection_mode ?? "vpn") === tab);

  async function load() { try { setRouters(await list()); } catch (e) { setMsg((e as Error).message); } }
  useEffect(() => { void load(); }, []);
  async function run(fn: () => Promise<unknown>) { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await run(async () => { await save({ data: { name: String(f.get("name")), base_url: tab === "public_ip" ? `${f.get("proto")}://${String(f.get("ip")).trim()}:${f.get("port")}` : String(f.get("url")), connection_mode: tab, username: String(f.get("user")), password: String(f.get("pass")), dhcp_server: String(f.get("dhcp")) } }); setShowForm(false); await load(); });
  }
  async function loadStatus(id: string) { setSelected(id); setConn(null); await run(async () => setConn(await status({ data: { id } }))); }

  return <div className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-6xl">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao painel</Link>
      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm text-muted-foreground">Integração RouterOS 7</p><h1 className="text-3xl font-extrabold">MikroTik</h1></div>
        <Button onClick={() => setShowForm(v => !v)}><Plus />Novo roteador</Button>
      </div>
      <div className="mt-6 inline-flex rounded-md border bg-card p-1">{([["public_ip", "IP público"], ["vpn", "VPN"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => { setTab(k); setSelected(null); }} className={`rounded px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}</div>
      {msg && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}

      {showForm && <form onSubmit={onSave} className="mt-6 grid gap-4 border bg-card p-5 md:grid-cols-2">
        <F label="Nome"><Input name="name" required placeholder="Concentrador Centro" /></F>
        {tab === "public_ip" ? <><F label="IP público ou domínio"><Input name="ip" required placeholder="200.100.50.10" /></F><div className="grid grid-cols-2 gap-3"><F label="Protocolo"><select name="proto" defaultValue="https" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="https">HTTPS</option><option value="http">HTTP (inseguro)</option></select></F><F label="Porta"><Input name="port" type="number" required defaultValue="443" min="1" max="65535" /></F></div></> : <F label="Endereço na VPN (HTTPS)"><Input name="url" required type="url" placeholder="https://10.8.0.1" /></F>}
        <F label="Usuário da API"><Input name="user" required /></F>
        <F label="Senha"><Input name="pass" type="password" required /></F>
        <F label="Servidor DHCP (IPoE)"><Input name="dhcp" placeholder="dhcp-clientes" /></F>
        <div className="flex items-end"><Button disabled={busy} className="w-full" type="submit">Salvar roteador</Button></div>
        {tab === "public_ip" ? <p className="text-xs text-muted-foreground md:col-span-2">No RouterOS, ative o serviço <b>www-ssl</b> com um certificado válido (ex.: Let's Encrypt via <code>/certificate enable-ssl-certificate</code>), mude a porta padrão se quiser e libere-a no firewall apenas para os IPs do painel. Use um usuário com permissões read, write, api e rest-api.</p> : <p className="text-xs text-muted-foreground md:col-span-2">Ative o serviço <b>www-ssl</b> no RouterOS e garanta que o endereço seja alcançável pela internet (encaminhamento de porta a partir da VPN, restrito por IP). Use um usuário com permissões read, write, api e rest-api.</p>}
      </form>}

      <section className="mt-6 border bg-card">
        <Table><TableHeader><TableRow><TableHead>Roteador</TableHead><TableHead>Endereço</TableHead><TableHead>Último teste</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{shown.map(r => <TableRow key={r.id}>
            <TableCell className="font-semibold"><span className="flex items-center gap-2"><RouterIcon className="h-4 w-4 text-primary" />{r.name}</span></TableCell>
            <TableCell className="font-mono text-xs">{r.base_url}</TableCell>
            <TableCell>{r.last_check_at ? <span className="flex items-center gap-2 text-sm">{r.last_check_ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}<span className="max-w-xs truncate text-muted-foreground" title={r.last_check_message ?? ""}>{r.last_check_message}</span></span> : <span className="text-sm text-muted-foreground">Nunca testado</span>}</TableCell>
            <TableCell className="space-x-2 text-right whitespace-nowrap">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { await test({ data: { id: r.id } }); await load(); })}>Testar</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const res = await sync({ data: { id: r.id } }); setMsg(""); alert(`${res.count} planos sincronizados.`); })}>Sincronizar planos</Button>
              <Button size="sm" disabled={busy} onClick={() => loadStatus(r.id)}>Conexões</Button>
              <Button size="icon" variant="ghost" aria-label="Excluir" disabled={busy} onClick={() => confirm("Remover roteador?") && run(async () => { await del({ data: { id: r.id } }); await load(); })}><Trash2 /></Button>
            </TableCell>
          </TableRow>)}
          {!shown.length && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Nenhum roteador cadastrado.</TableCell></TableRow>}</TableBody></Table>
      </section>

      {selected && <section className="mt-6 border bg-card">
        <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Conexões ativas</h2><p className="text-xs text-muted-foreground">{routers.find(r => r.id === selected)?.name}</p></div><Button size="sm" variant="ghost" disabled={busy} onClick={() => loadStatus(selected)}><RefreshCw />Atualizar</Button></div>
        {!conn ? <p className="p-6 text-sm text-muted-foreground">Carregando…</p> : conn.error ? <p className="p-6 text-sm text-destructive">{conn.error}</p> :
          <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Identificação</TableHead><TableHead>IP</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader><TableBody>
            {conn.pppoe.map(a => <TableRow key={"p" + a.name}><TableCell><Badge variant="outline">PPPoE</Badge></TableCell><TableCell className="font-mono text-xs">{a.name}</TableCell><TableCell className="font-mono text-xs">{a.address}</TableCell><TableCell className="text-xs text-muted-foreground">online há {a.uptime}</TableCell></TableRow>)}
            {conn.ipoe.map(l => <TableRow key={"i" + l.mac}><TableCell><Badge variant="outline">IPoE</Badge></TableCell><TableCell className="font-mono text-xs">{l.mac} {l.host}</TableCell><TableCell className="font-mono text-xs">{l.address}</TableCell><TableCell className="text-xs text-muted-foreground">visto {l.lastSeen || "agora"}</TableCell></TableRow>)}
            {!conn.pppoe.length && !conn.ipoe.length && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Nenhuma conexão ativa.</TableCell></TableRow>}
          </TableBody></Table>}
      </section>}

      <section className="mt-6 border bg-card p-5 text-sm">
        <h2 className="font-bold">Página de aviso para suspensos</h2>
        <p className="mt-1 text-muted-foreground">Clientes suspensos entram na lista <code className="font-mono">nexora_bloqueados</code>. Crie uma vez no roteador a regra que redireciona esse tráfego para sua página de aviso:</p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{`/ip firewall nat add chain=dstnat src-address-list=nexora_bloqueados protocol=tcp dst-port=80 action=dst-nat to-addresses=IP_DO_SERVIDOR_AVISO to-ports=80
/ip firewall filter add chain=forward src-address-list=nexora_bloqueados protocol=udp dst-port=53 action=accept
/ip firewall filter add chain=forward src-address-list=nexora_bloqueados dst-address=!IP_DO_SERVIDOR_AVISO action=drop`}</pre>
      </section>
    </div>
  </div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }
