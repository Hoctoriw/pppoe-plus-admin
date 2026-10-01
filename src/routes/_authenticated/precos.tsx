import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLicensePlans, saveLicensePlan, deleteLicensePlan, listLicensePayments, reviewLicensePayment, getLicenseBank, saveLicenseBank } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/precos")({
  head: () => ({ meta: [
    { title: "Preços de licença | Nexora ISP" },
    { name: "description", content: "Planos de licença, valores e pagamentos Pix do painel." },
    { property: "og:title", content: "Preços de licença | Nexora ISP" },
    { property: "og:description", content: "Planos de licença, valores e pagamentos Pix do painel." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: PricesPage,
});

type Plan = Awaited<ReturnType<typeof listLicensePlans>>[number];
type Pay = Awaited<ReturnType<typeof listLicensePayments>>[number];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const STATUS: Record<string, string> = { pending: "Aguardando", approved: "Aprovado", rejected: "Recusado" };

function PricesPage() {
  const list = useServerFn(listLicensePlans), save = useServerFn(saveLicensePlan), del = useServerFn(deleteLicensePlan), pays = useServerFn(listLicensePayments), review = useServerFn(reviewLicensePayment);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Pay[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const bankGet = useServerFn(getLicenseBank), bankSave = useServerFn(saveLicenseBank);
  const [bank, setBank] = useState<{ configured: boolean; environment: "production" | "sandbox"; active: boolean } | null>(null);

  async function load() {
    try { setPlans(await list()); setPayments(await pays()); setBank(await bankGet()); } catch (e) { setMsg((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg("");
    try { await fn(); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  function submit(e: React.FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const price = Number(String(f.get("price")).replace(",", "."));
    void run(async () => { await save({ data: { ...(id ? { id } : {}), name: String(f.get("name")), days: Number(f.get("days")), price, active: f.get("active") === "on", includes_network: f.get("includes_network") === "on" } }); if (!id) (e.target as HTMLFormElement).reset(); });
  }

  return <div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-5xl">
    <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
    <h1 className="mt-4 text-3xl font-extrabold">Preços de licença</h1>
    <p className="text-sm text-muted-foreground">Esses planos aparecem para as contas com licença expirada, com pagamento via Pix.</p>
    {msg && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}

    <section className="mt-6 border bg-card">
      <div className="border-b p-4"><p className="font-bold">Banco de recebimento (Asaas)</p><p className="text-xs text-muted-foreground">Com o banco ativo, cada pagamento gera um Pix na sua conta Asaas e o painel do usuário é liberado sozinho quando o Pix é pago. No Asaas, configure o webhook para <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/asaas</span>.</p></div>
      {bank && <form key={String(bank.configured) + bank.environment + bank.active} className="grid gap-2 p-4 md:grid-cols-[2fr_1fr_auto_auto]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); const k = String(f.get("api_key") || ""); void run(() => bankSave({ data: { ...(k ? { api_key: k } : {}), environment: f.get("environment") as "production" | "sandbox", active: f.get("active") === "on" } })); }}>
        <Input name="api_key" type="password" placeholder={bank.configured ? "Chave salva — deixe vazio para manter" : "Chave de API do Asaas"} />
        <select name="environment" defaultValue={bank.environment} className="rounded-md border bg-background px-2 text-sm"><option value="production">Produção</option><option value="sandbox">Teste (sandbox)</option></select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={bank.active} />Ativo</label>
        <Button size="sm" disabled={busy}>Salvar banco</Button>
      </form>}
    </section>

    <section className="mt-6 border bg-card">
      <div className="border-b p-4"><p className="font-bold">Planos</p><p className="text-xs text-muted-foreground">Marque <strong>Rede FTTH</strong> nos planos que dão acesso à aba Rede. Quem paga um plano sem essa marcação não vê a aba.</p></div>
      <div className="divide-y">
        {plans.map(p => <form key={p.id + p.price + p.days + p.name + p.active + p.includes_network} onSubmit={e => submit(e, p.id)} className="grid grid-cols-2 items-center gap-2 p-3 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto_auto]">
          <Input name="name" defaultValue={p.name} required />
          <Input name="days" type="number" min={1} defaultValue={p.days} required title="Dias" />
          <Input name="price" defaultValue={p.price.toFixed(2).replace(".", ",")} required title="Valor (R$)" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} />Ativo</label>
          <label className="flex items-center gap-1 text-sm" title="Inclui o módulo Rede FTTH"><input type="checkbox" name="includes_network" defaultChecked={p.includes_network} />Rede FTTH</label>
          <Button size="sm" disabled={busy}>Salvar</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => confirm(`Excluir o plano ${p.name}?`) && run(() => del({ data: { id: p.id } }))}><Trash2 className="text-destructive" /></Button>
        </form>)}
        <form onSubmit={e => submit(e)} className="grid grid-cols-2 items-center gap-2 bg-muted/40 p-3 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto]">
          <Input name="name" placeholder="Nome (ex: Trimestral)" required />
          <Input name="days" type="number" min={1} placeholder="Dias" required />
          <Input name="price" placeholder="Valor R$" required />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked />Ativo</label>
          <label className="flex items-center gap-1 text-sm" title="Inclui o módulo Rede FTTH"><input type="checkbox" name="includes_network" />Rede FTTH</label>
          <Button size="sm" disabled={busy}><Plus />Adicionar</Button>
        </form>
      </div>
    </section>

    <section className="mt-6 border bg-card">
      <div className="border-b p-4"><p className="font-bold">Pagamentos Pix</p><p className="text-xs text-muted-foreground">Confira no seu banco pelo valor e pelo código de identificação, depois aprove para liberar a licença.</p></div>
      <Table><TableHeader><TableRow><TableHead>Conta</TableHead><TableHead>Plano</TableHead><TableHead>Valor</TableHead><TableHead>Identificação</TableHead><TableHead>Data</TableHead><TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
        <TableBody>{payments.map(p => <TableRow key={p.id}>
          <TableCell>{p.user_name}</TableCell><TableCell>{p.plan_name} ({p.days}d)</TableCell><TableCell>{brl(p.amount)}</TableCell>
          <TableCell className="font-mono text-xs">{p.txid}</TableCell><TableCell className="text-xs">{new Date(p.created_at).toLocaleString("pt-BR")}</TableCell>
          <TableCell><Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{STATUS[p.status]}</Badge></TableCell>
          <TableCell className="text-right">{p.status === "pending" && <div className="flex justify-end gap-1">
            <Button size="sm" disabled={busy} onClick={() => run(() => review({ data: { id: p.id, approve: true } }))}><Check />Aprovar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => review({ data: { id: p.id, approve: false } }))}><X /></Button>
          </div>}</TableCell>
        </TableRow>)}
        {!payments.length && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Nenhum pagamento ainda.</TableCell></TableRow>}</TableBody>
      </Table>
    </section>
  </div></div>;
}
