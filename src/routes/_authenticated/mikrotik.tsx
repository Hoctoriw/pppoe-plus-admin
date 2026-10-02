import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Plus, RefreshCw, Router as RouterIcon, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { applyRadius, connectionStatus, deleteRouter, listRouters, saveRadiusConfig, saveRouter, syncPlans, testRadius, testRouter } from "@/lib/mikrotik.functions";
import { approveRadiusPairing, listRadiusAppliances, removeRadiusAppliance } from "@/lib/radius-appliance.functions";

function RadiusInstaller() {
  const listApp = useServerFn(listRadiusAppliances), approve = useServerFn(approveRadiusPairing), remove = useServerFn(removeRadiusAppliance);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [apps, setApps] = useState<Awaited<ReturnType<typeof listRadiusAppliances>>>([]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const refresh = () => listApp().then(setApps).catch(() => {});
  useEffect(() => { void refresh(); const t = setInterval(refresh, 30000); return () => clearInterval(t); }, []);
  async function pair(e: FormEvent) {
    e.preventDefault(); setErr(""); setOk(""); setBusy(true);
    try { const r = await approve({ data: { code: code.replace(/\D/g, "") } }); setOk(`Servidor ${r.hostname} (${r.local_ip ?? "?"}) vinculado. Ele se instala sozinho em alguns minutos.`); setCode(""); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }
  const online = (d: string) => Date.now() - new Date(d).getTime() < 3 * 60_000;
  return <div className="border bg-card p-5 text-sm">
    <h2 className="font-bold">Servidor RADIUS próprio (ISO autoinstalável)</h2>
    <p className="mt-1 text-muted-foreground">A ISO é genérica e não leva nenhuma senha do painel. No primeiro boot, a máquina mostra na tela um <b>código de 6 números</b> (vale 15 minutos). Digite-o abaixo para vincular: o servidor recebe uma chave só dele, instala o FreeRADIUS, autoriza os roteadores com RADIUS ativo e recebe atualizações futuras sozinho.</p>

    <form onSubmit={pair} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="space-y-2"><Label>Vincular servidor</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="123 456" inputMode="numeric" maxLength={7} className="w-40 font-mono text-lg tracking-widest" /></div>
      <Button type="submit" size="sm" disabled={busy || code.replace(/\D/g, "").length !== 6}>Vincular</Button>
    </form>
    {ok && <p className="mt-2 text-xs text-primary">{ok}</p>}
    {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

    <div className="mt-4">
      <p className="font-semibold">Servidores vinculados</p>
      {apps.length ? <ul className="mt-2 space-y-2">{apps.map(a => <li key={a.hostname} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
        {online(a.last_seen_at) && a.radius_ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}
        <span className="font-semibold">{a.hostname}</span><span className="font-mono text-xs">{a.local_ip}</span>
        <Badge variant="outline">v{a.version || "instalando"}</Badge>
        <span className="flex-1 text-xs text-muted-foreground">{online(a.last_seen_at) ? (a.radius_ok ? "online" : "RADIUS parado / instalando") : "offline"} · último contato {new Date(a.last_seen_at).toLocaleString("pt-BR")} {a.uptime ? `· ${a.uptime}` : ""}</span>
        <Button size="icon" variant="ghost" aria-label="Desvincular" onClick={() => confirm(`Desvincular ${a.hostname}? Ele perde o acesso ao painel.`) && void remove({ data: { hostname: a.hostname } }).then(refresh)}><Trash2 /></Button>
      </li>)}</ul> : <p className="mt-1 text-xs text-muted-foreground">Nenhum servidor vinculado ainda.</p>}
    </div>

    <div className="mt-4 space-y-3">
      <div><p className="font-semibold">Opção 1 — Gerar a ISO (num computador com Linux)</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">{`sudo apt install -y xorriso curl\ncurl -fsSL ${origin}/radius-iso-build.sh -o build.sh && bash build.sh ${origin} SENHA_ROOT`}</pre>
        <p className="text-xs text-muted-foreground">Grave a <b>nexora-radius.iso</b> num pendrive (Rufus/Balena Etcher) ou use numa máquina virtual (Proxmox, VMware, VirtualBox). A mesma ISO serve para quantas máquinas quiser. <b>A instalação apaga o disco.</b></p></div>
      <div><p className="font-semibold">Opção 2 — Debian 12 já instalado</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs">{`sudo mkdir -p /opt/nexora && echo 'PANEL_URL=${origin}' | sudo tee /opt/nexora/env >/dev/null\ncurl -fsSL ${origin}/radius-pair.sh | sudo bash`}</pre>
        <p className="text-xs text-muted-foreground">O código aparece na tela; digite-o acima.</p></div>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Use o endereço do painel publicado para produção. Depois de instalado, aponte cada roteador para o IP do servidor no cartão acima.</p>
  </div>;
}

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
  const saveRadius = useServerFn(saveRadiusConfig), applyRad = useServerFn(applyRadius), testRad = useServerFn(testRadius);
  const [routers, setRouters] = useState<RouterRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [conn, setConn] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"vpn" | "public_ip" | "radius">("public_ip");
  const shown = tab === "radius" ? routers : routers.filter(r => (r.connection_mode ?? "vpn") === tab);

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
        {tab !== "radius" && <Button onClick={() => setShowForm(v => !v)}><Plus />Novo roteador</Button>}
      </div>
      <div className="mt-6 inline-flex rounded-md border bg-card p-1">{([["public_ip", "IP público"], ["vpn", "VPN"], ["radius", "RADIUS"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => { setTab(k); setSelected(null); }} className={`rounded px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>)}</div>
      {msg && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}

      {showForm && tab !== "radius" && <form onSubmit={onSave} className="mt-6 grid gap-4 border bg-card p-5 md:grid-cols-2">
        <F label="Nome"><Input name="name" required placeholder="Concentrador Centro" /></F>
        {tab === "public_ip" ? <><F label="IP público ou domínio"><Input name="ip" required placeholder="200.100.50.10" /></F><div className="grid grid-cols-2 gap-3"><F label="Protocolo"><select name="proto" defaultValue="https" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="https">HTTPS</option><option value="http">HTTP (inseguro)</option></select></F><F label="Porta"><Input name="port" type="number" required defaultValue="443" min="1" max="65535" /></F></div></> : <F label="Endereço na VPN (HTTPS)"><Input name="url" required type="url" placeholder="https://10.8.0.1" /></F>}
        <F label="Usuário da API"><Input name="user" required /></F>
        <F label="Senha"><Input name="pass" type="password" required /></F>
        <F label="Servidor DHCP (IPoE)"><Input name="dhcp" placeholder="dhcp-clientes" /></F>
        <div className="flex items-end"><Button disabled={busy} className="w-full" type="submit">Salvar roteador</Button></div>
        {tab === "public_ip" ? <p className="text-xs text-muted-foreground md:col-span-2">No RouterOS, ative o serviço <b>www-ssl</b> com um certificado válido (ex.: Let's Encrypt via <code>/certificate enable-ssl-certificate</code>), mude a porta padrão se quiser e libere-a no firewall apenas para os IPs do painel. Use um usuário com permissões read, write, api e rest-api.</p> : <p className="text-xs text-muted-foreground md:col-span-2">Ative o serviço <b>www-ssl</b> no RouterOS e garanta que o endereço seja alcançável pela internet (encaminhamento de porta a partir da VPN, restrito por IP). Use um usuário com permissões read, write, api e rest-api.</p>}
      </form>}

      {tab === "radius" && <section className="mt-6 space-y-4">
        <div className="border bg-card p-5 text-sm">
          <h2 className="font-bold">Autenticação via RADIUS</h2>
          <p className="mt-1 text-muted-foreground">Com RADIUS, o MikroTik consulta o cadastro do painel para autenticar cada cliente PPPoE/IPoE — sem precisar provisionar usuário por usuário no roteador. O painel roda na nuvem e não fala o protocolo RADIUS (UDP) diretamente; por isso você precisa de um servidor <b>FreeRADIUS</b> na sua rede lendo o banco de dados do painel. Configure abaixo onde cada roteador deve apontar e clique em <b>Aplicar no roteador</b>.</p>
        </div>
        {routers.map(r => <RadiusCard key={r.id} r={r} busy={busy} onSave={async (f) => run(async () => { await saveRadius({ data: f }); await load(); setMsg(""); })} onApply={() => run(async () => { await applyRad({ data: { id: r.id } }); alert("RADIUS aplicado no roteador."); })} onTest={async () => { let res: RadiusTest | null = null; await run(async () => { res = await testRad({ data: { id: r.id } }); }); return res; }} />)}
        {!routers.length && <p className="border bg-card p-6 text-center text-sm text-muted-foreground">Cadastre um roteador primeiro.</p>}
        <RadiusInstaller />
      </section>}

      {tab !== "radius" && <section className="mt-6 border bg-card">
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
      </section>}

      {selected && <section className="mt-6 border bg-card">
        <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-bold">Conexões ativas</h2><p className="text-xs text-muted-foreground">{routers.find(r => r.id === selected)?.name}</p></div><Button size="sm" variant="ghost" disabled={busy} onClick={() => loadStatus(selected)}><RefreshCw />Atualizar</Button></div>
        {!conn ? <p className="p-6 text-sm text-muted-foreground">Carregando…</p> : conn.error ? <p className="p-6 text-sm text-destructive">{conn.error}</p> :
          <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Identificação</TableHead><TableHead>IP</TableHead><TableHead>Detalhe</TableHead></TableRow></TableHeader><TableBody>
            {conn.pppoe.map(a => <TableRow key={"p" + a.name}><TableCell><Badge variant="outline">PPPoE</Badge></TableCell><TableCell className="font-mono text-xs">{a.name}</TableCell><TableCell className="font-mono text-xs">{a.address}</TableCell><TableCell className="text-xs text-muted-foreground">online há {a.uptime}</TableCell></TableRow>)}
            {conn.ipoe.map(l => <TableRow key={"i" + l.mac}><TableCell><Badge variant="outline">IPoE</Badge></TableCell><TableCell className="font-mono text-xs">{l.mac} {l.host}</TableCell><TableCell className="font-mono text-xs">{l.address}</TableCell><TableCell className="text-xs text-muted-foreground">visto {l.lastSeen || "agora"}</TableCell></TableRow>)}
            {!conn.pppoe.length && !conn.ipoe.length && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">Nenhuma conexão ativa.</TableCell></TableRow>}
          </TableBody></Table>}
      </section>}

      <BlockPageCard />

    </div>
  </div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label>{label}</Label>{children}</div>; }

function BlockPageCard() {
  const [empresa, setEmpresa] = useState("");
  const [fone, setFone] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const qs = new URLSearchParams();
  if (empresa.trim()) qs.set("empresa", empresa.trim());
  if (fone.trim()) qs.set("whatsapp", fone.trim());
  const url = `${origin}/bloqueado${qs.toString() ? `?${qs}` : ""}`;
  return <section className="mt-6 border bg-card p-5 text-sm">
    <h2 className="font-bold">Página de bloqueio para clientes</h2>
    <p className="mt-1 text-muted-foreground">Clientes suspensos entram na lista <code className="font-mono">nexora_bloqueados</code>. Preencha os dados abaixo, copie o endereço e aplique o script no roteador: quem estiver bloqueado cai direto nessa página ao abrir qualquer site.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <F label="Nome do provedor (aparece na página)"><Input value={empresa} onChange={e => setEmpresa(e.target.value)} placeholder="Syncron Telecom" /></F>
      <F label="WhatsApp do atendimento"><Input value={fone} onChange={e => setFone(e.target.value)} placeholder="11999998888" /></F>
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs break-all">{url}</code>
      <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(url)}>Copiar endereço</Button>
      <Button size="sm" variant="outline" asChild><a href={url} target="_blank" rel="noreferrer">Abrir página</a></Button>
    </div>
    <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{`/ip proxy set enabled=yes port=8181
/ip proxy access add action=deny redirect-to="${url.replace(/^https?:\/\//, "")}" comment="nexora-bloqueio"
/ip firewall nat add chain=dstnat src-address-list=nexora_bloqueados protocol=tcp dst-port=80 action=redirect to-ports=8181 comment="nexora-bloqueio"
/ip firewall filter add chain=forward src-address-list=nexora_bloqueados protocol=udp dst-port=53 action=accept comment="nexora-bloqueio"
/ip firewall filter add chain=forward src-address-list=nexora_bloqueados action=drop comment="nexora-bloqueio"`}</pre>
    <p className="mt-2 text-xs text-muted-foreground">Sites abertos em HTTPS não podem ser redirecionados pelo roteador: o cliente vê erro de conexão até abrir um endereço comum (http). Por isso a página também deve ser divulgada no atendimento.</p>
  </section>;
}


type RadiusTest = Awaited<ReturnType<typeof testRadius>>;

function RadiusCard({ r, busy, onSave, onApply, onTest }: { r: RouterRow; busy: boolean; onSave: (f: { id: string; radius_enabled: boolean; radius_host?: string; radius_secret?: string | undefined; radius_auth_port: number; radius_acct_port: number }) => Promise<void>; onApply: () => void; onTest: () => Promise<RadiusTest | null> }) {
  const [enabled, setEnabled] = useState(r.radius_enabled ?? false);
  const [test, setTest] = useState<RadiusTest | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await onSave({ id: r.id, radius_enabled: enabled, radius_host: String(f.get("rhost")).trim(), radius_secret: String(f.get("rsecret")).trim() || undefined, radius_auth_port: Number(f.get("rauth")) || 1812, radius_acct_port: Number(f.get("racct")) || 1813 });
  }
  return <form onSubmit={submit} className="border bg-card p-5">
    <div className="flex items-center justify-between">
      <p className="flex items-center gap-2 font-semibold"><RouterIcon className="h-4 w-4 text-primary" />{r.name} <span className="font-mono text-xs font-normal text-muted-foreground">{r.base_url}</span></p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-4 w-4" />Usar RADIUS</label>
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-4">
      <F label="Servidor RADIUS (IP/domínio)"><Input name="rhost" defaultValue={r.radius_host ?? ""} placeholder="10.0.0.5" disabled={!enabled} /></F>
      <F label="Segredo compartilhado"><Input name="rsecret" type="password" placeholder={r.radius_enabled ? "•••••• (mantido se vazio)" : "segredo"} disabled={!enabled} /></F>
      <F label="Porta autenticação"><Input name="rauth" type="number" defaultValue={r.radius_auth_port ?? 1812} min="1" max="65535" disabled={!enabled} /></F>
      <F label="Porta contabilidade"><Input name="racct" type="number" defaultValue={r.radius_acct_port ?? 1813} min="1" max="65535" disabled={!enabled} /></F>
    </div>
    <div className="mt-4 flex gap-2">
      <Button type="submit" size="sm" disabled={busy}>Salvar configuração</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !enabled} onClick={onApply}>Aplicar no roteador</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !r.radius_enabled} onClick={async () => { setTest(null); setTest(await onTest()); }}><RefreshCw className="h-3.5 w-3.5" />Testar comunicação</Button>
    </div>
    {test && <div className={`mt-4 rounded-md border p-4 ${test.ok ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}>
      <p className="flex items-center gap-2 text-sm font-semibold">{test.ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <XCircle className="h-4 w-4 text-destructive" />}{test.ok ? "RADIUS configurado e alcançável" : "Foram encontrados problemas"}</p>
      <ul className="mt-3 space-y-2">
        {test.checks.map((c) => <li key={c.label} className="flex items-start gap-2 text-sm">
          {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
          <span><span className="font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.detail}</span></span>
        </li>)}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">O teste roda no próprio roteador: ele pinga o servidor FreeRADIUS e confere se autenticação e accounting estão apontando para o endereço e portas certos.</p>
    </div>}
  </form>;
}
