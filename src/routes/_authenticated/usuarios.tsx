import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, RefreshCw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listUsers, setUserActive, setUserRole, listLicenses, extendLicense, deleteUserAccount, setLicenseNetwork, setLicenseSpeedtest, setUserPassword } from "@/lib/users.functions";
import { setSupportEmail, setTeamExport, setTrialDays } from "@/lib/settings.functions";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [
    { title: "Usuários e permissões | Syncron ISP" },
    { name: "description", content: "Gestão de funções e permissões dos usuários do painel." },
    { property: "og:title", content: "Usuários e permissões | Syncron ISP" },
    { property: "og:description", content: "Gestão de funções e permissões dos usuários do painel." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: UsersPage,
});

type UserRow = Awaited<ReturnType<typeof listUsers>>[number];
type Role = "admin" | "operator" | "viewer";

const ROLE_LABEL: Record<Role, string> = { admin: "Administrador", operator: "Operador", viewer: "Visualizador" };

const PERMISSIONS: { label: string; roles: Record<Role, boolean> }[] = [
  { label: "Ver clientes, planos e painel", roles: { admin: true, operator: true, viewer: true } },
  { label: "Cadastrar e editar clientes", roles: { admin: true, operator: true, viewer: false } },
  { label: "Cadastrar e editar planos", roles: { admin: true, operator: true, viewer: false } },
  { label: "Suspender e reativar clientes", roles: { admin: true, operator: true, viewer: false } },
  { label: "Provisionar clientes no MikroTik", roles: { admin: true, operator: true, viewer: false } },
  { label: "Testar roteadores e ver conexões", roles: { admin: true, operator: true, viewer: false } },
  { label: "Excluir clientes e planos", roles: { admin: true, operator: false, viewer: false } },
  { label: "Cadastrar e excluir roteadores", roles: { admin: true, operator: false, viewer: false } },
  { label: "Gerenciar usuários e funções", roles: { admin: true, operator: false, viewer: false } },
];

function UsersPage() {
  const list = useServerFn(listUsers), setRole = useServerFn(setUserRole), setActive = useServerFn(setUserActive), licList = useServerFn(listLicenses), extend = useServerFn(extendLicense), deleteAcc = useServerFn(deleteUserAccount), setNetwork = useServerFn(setLicenseNetwork), setSpeed = useServerFn(setLicenseSpeedtest), setPw = useServerFn(setUserPassword);
  const [lic, setLic] = useState<Record<string, { expires_at: string; has_network: boolean; has_speedtest: boolean }>>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [exp, setExp] = useState<string[]>([]);
  const setExport = useServerFn(setTeamExport);

  async function load() {
    try { setUsers(await list()); setLic(Object.fromEntries((await licList()).map(l => [l.user_id, { expires_at: l.expires_at, has_network: l.has_network, has_speedtest: l.has_speedtest }]))); setDenied(false); const { data } = await (supabase as any).rpc("admin_export_users"); setExp(((data ?? []) as any[]).map((x) => typeof x === "string" ? x : Object.values(x)[0] as string)); }
    catch (e) { setDenied(true); setMsg((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg("");
    try { await fn(); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-background p-4 md:p-8">
    <div className="mx-auto max-w-6xl">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao painel</Link>
      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm text-muted-foreground">Administração</p><h1 className="text-3xl font-extrabold">Usuários e permissões</h1><SupportEmailEditor /><MapLayerEditor />{!denied && <TrialDaysEditor />}</div>
        <div className="flex gap-2"><Button asChild variant="outline"><Link to="/precos">Preços de licença</Link></Button><Button variant="outline" disabled={busy} onClick={() => run(async () => {})}><RefreshCw />Atualizar</Button></div>
      </div>
      {msg && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}

      {!denied && <section className="mt-6 border bg-card">
        <div className="border-b p-4"><h2 className="flex items-center gap-2 font-bold"><UserCog className="h-4 w-4 text-primary" />Usuários do painel</h2><p className="text-xs text-muted-foreground">Altere as funções de cada usuário. Um usuário pode acumular funções.</p></div>
        <Table><TableHeader><TableRow><TableHead>Usuário</TableHead><TableHead>Funções</TableHead><TableHead>Cadastro</TableHead><TableHead>Licença</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>{[...users].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(u => <TableRow key={u.id}>
            <TableCell><p className="font-semibold">{u.full_name || "Sem nome"}</p><p className="text-xs text-muted-foreground">{u.email}</p></TableCell>
            <TableCell><div className="flex flex-wrap gap-1">{(["admin", "operator", "viewer"] as Role[]).map(r => {
              const has = u.roles.includes(r);
              return <button key={r} type="button" disabled={busy} title={has ? `Remover ${ROLE_LABEL[r]}` : `Conceder ${ROLE_LABEL[r]}`}
                onClick={() => run(async () => setRole({ data: { userId: u.id, role: r, grant: !has } }))}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${has ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary hover:text-foreground"}`}>{ROLE_LABEL[r]}</button>;
            })}</div></TableCell>
            <TableCell className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</TableCell>
            <TableCell>{u.roles.includes("admin") ? <Badge>Administrador</Badge> : (() => { const l = lic[u.id]; const e = l?.expires_at; const ok = !!e && new Date(e) > new Date(); const net = !!l?.has_network; const sp = !!l?.has_speedtest; return <div className="space-y-1"><Badge variant={ok ? "default" : "destructive"}>{ok ? `Até ${new Date(e!).toLocaleDateString("pt-BR")}` : "Expirada"}</Badge><div className="flex flex-wrap gap-1">{[30, 365].map(d => <button key={d} type="button" disabled={busy} className="rounded border px-1.5 py-0.5 text-[11px] hover:border-primary" onClick={() => run(async () => extend({ data: { userId: u.id, days: d } }))}>+{d === 30 ? "30 dias" : "1 ano"}</button>)}{ok && <button type="button" disabled={busy} className="rounded border px-1.5 py-0.5 text-[11px] text-destructive hover:border-destructive" onClick={() => run(async () => extend({ data: { userId: u.id, days: 0 } }))}>Bloquear</button>}</div><button type="button" disabled={busy} title="Liberar ou bloquear a aba Rede FTTH desta conta" className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${net ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary"}`} onClick={() => run(async () => setNetwork({ data: { userId: u.id, enabled: !net } }))}>Rede FTTH {net ? "liberada" : "bloqueada"}</button><button type="button" disabled={busy} title="Liberar ou bloquear o teste de velocidade desta conta" className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${sp ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary"}`} onClick={() => run(async () => setSpeed({ data: { userId: u.id, enabled: !sp } }))}>Velocidade {sp ? "liberada" : "bloqueada"}</button><button type="button" disabled={busy} title="Liberar ou ocultar a exportação do mapa para este usuário" className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${exp.includes(u.id) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary"}`} onClick={() => run(async () => setExport({ data: { userId: u.id, allowed: !exp.includes(u.id) } }))}>Exportar mapa {exp.includes(u.id) ? "liberado" : "oculto"}</button></div>; })()}</TableCell>
            <TableCell><Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Ativo" : "Desativado"}</Badge></TableCell>
            <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { const p = window.prompt(`Nova senha para ${u.email} (mínimo 6 caracteres):`); if (p && p.length >= 6) void run(async () => { await setPw({ data: { userId: u.id, password: p } }); alert("Senha alterada."); }); else if (p) alert("A senha precisa ter pelo menos 6 caracteres."); }}>Trocar senha</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setActive({ data: { userId: u.id, active: !u.active } }))}>{u.active ? "Desativar" : "Reativar"}</Button>{!u.roles.includes("admin") && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Excluir a conta de ${u.full_name || u.email}? Todos os dados do painel dessa conta (clientes, planos, roteadores e cobranças) serão apagados. Essa ação não pode ser desfeita.`)) void run(async () => deleteAcc({ data: { userId: u.id } })); }}><Trash2 className="h-4 w-4" />Excluir</Button>}</div></TableCell>
          </TableRow>)}
          {!users.length && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhum usuário encontrado.</TableCell></TableRow>}</TableBody></Table>
      </section>}

      <section className="mt-6 border bg-card">
        <div className="border-b p-4"><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-4 w-4 text-primary" />Permissões por função</h2><p className="text-xs text-muted-foreground">O que cada função pode fazer no sistema.</p></div>
        <Table><TableHeader><TableRow><TableHead>Permissão</TableHead><TableHead className="text-center">Administrador</TableHead><TableHead className="text-center">Operador</TableHead><TableHead className="text-center">Visualizador</TableHead></TableRow></TableHeader>
          <TableBody>{PERMISSIONS.map(p => <TableRow key={p.label}>
            <TableCell className="text-sm">{p.label}</TableCell>
            {(["admin", "operator", "viewer"] as Role[]).map(r => <TableCell key={r} className="text-center">{p.roles[r] ? <Check className="mx-auto h-4 w-4 text-primary" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />}</TableCell>)}
          </TableRow>)}</TableBody></Table>
      </section>
    </div>
  </div>;
}

function TrialDaysEditor() {
  const save = useServerFn(setTrialDays);
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.from("app_settings").select("trial_days").eq("id", 1).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) { toast.error("Não foi possível carregar o período de teste."); return; }
      setDays(String(data?.trial_days ?? 7));
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  return <form className="mt-2 border-t py-4" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true);
    try { await save({ data: { days: Number(days) } }); toast.success("Período de teste atualizado para novas contas."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Erro ao salvar."); }
    finally { setBusy(false); }
  }}>
    <div className="flex flex-wrap items-end gap-2">
      <label htmlFor="trial-days" className="flex flex-col gap-1 text-sm"><span className="font-semibold">Dias de teste para novas contas</span>
        <Input id="trial-days" type="number" min={0} max={365} step={1} required value={days} disabled={!ready || busy} onChange={(event) => setDays(event.target.value)} className="w-32" />
      </label>
      <Button type="submit" disabled={!ready || busy || days === ""}>{busy ? "Salvando…" : "Salvar dias de teste"}</Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">De 0 a 365 dias. Zero desativa o teste grátis. Contas existentes mantêm sua validade.</p>
  </form>;
}

function SupportEmailEditor() {
  const save = useServerFn(setSupportEmail);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.from("app_settings").select("support_email").eq("id", 1).maybeSingle().then(({ data }) => setEmail(data?.support_email ?? "")); }, []);
  return <form className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await save({ data: { email } }); toast.success("E-mail de suporte atualizado."); } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao salvar."); } finally { setBusy(false); } }}>
    <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">E-mail de suporte</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-72 rounded-md border bg-background px-3" /></label>
    <Button type="submit" disabled={busy}>Salvar</Button>
  </form>;
}

const MAP_OPTS = [
  ["google_hybrid", "Google Híbrido"], ["google_streets", "Google Ruas"], ["google_satellite", "Google Satélite"], ["osm", "OpenStreetMap"], ["esri", "Esri Satélite"],
] as const;

function MapLayerEditor() {
  const [layer, setLayer] = useState("google_hybrid");
  useEffect(() => { supabase.from("app_settings").select("default_map_layer").eq("id", 1).maybeSingle().then(({ data }) => setLayer((data as any)?.default_map_layer ?? "google_hybrid")); }, []);
  return <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
    <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">Mapa padrão</span>
      <select value={layer} onChange={async (e) => { const v = e.target.value; setLayer(v); const { error } = await (supabase as any).rpc("set_default_map_layer", { _layer: v }); if (error) toast.error(error.message); else toast.success("Mapa padrão atualizado."); }} className="h-9 w-72 rounded-md border bg-background px-3">
        {MAP_OPTS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
      </select>
    </label>
  </div>;
}
