import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLicensePlans, saveLicensePlan, deleteLicensePlan, listLicensePayments, reviewLicensePayment } from "@/lib/users.functions";

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

  async function load() {
    try { setPlans(await list()); setPayments(await pays()); } catch (e) { setMsg((e as Error).message); }
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
    void run(async () => { await save({ data: { ...(id ? { id } : {}), name: String(f.get("name")), days: Number(f.get("days")), price, active: f.get("active") === "on" } }); if (!id) (e.target as HTMLFormElement).reset(); });
  }

  return <div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-5xl">
    <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
    <h1 className="mt-4 text-3xl font-extrabold">Preços de licença</h1>
    <p className="text-sm text-muted-foreground">Esses planos aparecem para as contas com licença expirada, com pagamento via Pix.</p>
    {msg && <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{msg}</p>}

    <section className="mt-6 border bg-card">
      <div className="border-b p-4 font-bold">Planos</div>
      <div className="divide-y">
        {plans.map(p => <form key={p.id + p.price + p.days + p.name + p.active} onSubmit={e => submit(e, p.id)} className="grid grid-cols-2 items-center gap-2 p-3 md:grid-cols-[2fr_1fr_1fr_auto_auto_auto]">
          <Input name="name" defaultValue={p.name} required />
          <Input name="days" type="number" min={1} defaultValue={p.days} required title="Dias" />
          <Input name="price" defaultValue={p.price.toFixed(2).replace(".", ",")} required title="Valor (R$)" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} />Ativo</label>
          <Button size="sm" disabled={busy}>Salvar</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => confirm(`Excluir o plano ${p.name}?`) && run(() => del({ data: { id: p.id } }))}><Trash2 className="text-destructive" /></Button>
        </form>)}
        <form onSubmit={e => submit(e)} className="grid grid-cols-2 items-center gap-2 bg-muted/40 p-3 md:grid-cols-[2fr_1fr_1fr_auto_auto]">
          <Input name="name" placeholder="Nome (ex: Trimestral)" required />
          <Input name="days" type="number" min={1} placeholder="Dias" required />
          <Input name="price" placeholder="Valor R$" required />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked />Ativo</label>
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
