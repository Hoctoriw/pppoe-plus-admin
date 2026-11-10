import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDemoRequests, setDemoStatus } from "@/lib/demo.functions";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [
    { title: "Leads de demonstração | Syncron ISP" },
    { name: "description", content: "Provedores que pediram demonstração do Syncron ISP." },
    { property: "og:title", content: "Leads de demonstração | Syncron ISP" },
    { property: "og:description", content: "Provedores que pediram demonstração do Syncron ISP." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LeadsPage,
});

type Lead = Awaited<ReturnType<typeof listDemoRequests>>[number];
const STATUSES = ["novo", "contatado", "cliente", "descartado"] as const;

function waLink(l: Lead) {
  let n = l.whatsapp.replace(/\D/g, "");
  if (n.length <= 11) n = "55" + n;
  const msg = `Olá ${l.name}, aqui é da Syncron ISP! Vi que você pediu uma demonstração para a ${l.company}. Posso te mostrar o sistema?`;
  return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
}

function LeadsPage() {
  const list = useServerFn(listDemoRequests), setStatus = useServerFn(setDemoStatus);
  const [rows, setRows] = useState<Lead[]>([]), [msg, setMsg] = useState("");
  async function load() { try { setRows(await list()); } catch (e) { setMsg((e as Error).message); } }
  useEffect(() => { void load(); }, []);
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
      <h1 className="text-2xl font-bold">Leads de demonstração</h1>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Nome</TableHead><TableHead>Provedor</TableHead><TableHead>Contato</TableHead><TableHead>Clientes</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum pedido ainda.</TableCell></TableRow>}
            {rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell>{l.name}</TableCell>
                <TableCell>{l.company}</TableCell>
                <TableCell className="text-sm">{l.whatsapp}<br /><span className="text-muted-foreground">{l.email}</span></TableCell>
                <TableCell>{l.size}</TableCell>
                <TableCell>
                  <select className="h-9 rounded-md border bg-background px-2 text-sm" value={l.status} onChange={async (e) => { await setStatus({ data: { id: l.id, status: e.target.value as (typeof STATUSES)[number] } }); void load(); }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
                <TableCell><Button asChild size="sm"><a href={waLink(l)} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
