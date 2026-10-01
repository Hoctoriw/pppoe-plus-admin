import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, RefreshCw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listUsers, setUserActive, setUserRole, listLicenses, extendLicense, deleteUserAccount, setLicenseNetwork } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [
    { title: "Usuários e permissões | Nexora ISP" },
    { name: "description", content: "Gestão de funções e permissões dos usuários do painel." },
    { property: "og:title", content: "Usuários e permissões | Nexora ISP" },
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
  const list = useServerFn(listUsers), setRole = useServerFn(setUserRole), setActive = useServerFn(setUserActive), licList = useServerFn(listLicenses), extend = useServerFn(extendLicense), deleteAcc = useServerFn(deleteUserAccount), setNetwork = useServerFn(setLicenseNetwork);
  const [lic, setLic] = useState<Record<string, { expires_at: string; has_network: boolean }>>({});
  const [users, setUsers] = useState<UserRow[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  async function load() {
    try { setUsers(await list()); setLic(Object.fromEntries((await licList()).map(l => [l.user_id, { expires_at: l.expires_at, has_network: l.has_network }]))); setDenied(false); }
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
        <div><p className="text-sm text-muted-foreground">Administração</p><h1 className="text-3xl font-extrabold">Usuários e permissões</h1></div>
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
            <TableCell>{u.roles.includes("admin") ? <Badge>Administrador</Badge> : (() => { const e = lic[u.id]; const ok = !!e && new Date(e) > new Date(); return <div className="space-y-1"><Badge variant={ok ? "default" : "destructive"}>{ok ? `Até ${new Date(e!).toLocaleDateString("pt-BR")}` : "Expirada"}</Badge><div className="flex flex-wrap gap-1">{[30, 365].map(d => <button key={d} type="button" disabled={busy} className="rounded border px-1.5 py-0.5 text-[11px] hover:border-primary" onClick={() => run(async () => extend({ data: { userId: u.id, days: d } }))}>+{d === 30 ? "30 dias" : "1 ano"}</button>)}{ok && <button type="button" disabled={busy} className="rounded border px-1.5 py-0.5 text-[11px] text-destructive hover:border-destructive" onClick={() => run(async () => extend({ data: { userId: u.id, days: 0 } }))}>Bloquear</button>}</div></div>; })()}</TableCell>
            <TableCell><Badge variant={u.active ? "default" : "secondary"}>{u.active ? "Ativo" : "Desativado"}</Badge></TableCell>
            <TableCell className="text-right"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => setActive({ data: { userId: u.id, active: !u.active } }))}>{u.active ? "Desativar" : "Reativar"}</Button>{!u.roles.includes("admin") && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (window.confirm(`Excluir a conta de ${u.full_name || u.email}? Todos os dados do painel dessa conta (clientes, planos, roteadores e cobranças) serão apagados. Essa ação não pode ser desfeita.`)) void run(async () => deleteAcc({ data: { userId: u.id } })); }}><Trash2 className="h-4 w-4" />Excluir</Button>}</div></TableCell>
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
