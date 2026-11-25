import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listRouterDestinations, setRouterDestinationApproval } from "@/lib/router-approvals.functions";

export function RouterDestinationApprovals() {
  const list = useServerFn(listRouterDestinations), approve = useServerFn(setRouterDestinationApproval);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listRouterDestinations>>>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function load() {
    setBusy(true);
    try { setRows(await list()); setMessage(""); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao consultar destinos."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function change(row: typeof rows[number]) {
    if (!confirm(`${row.approved ? "Revogar" : "Aprovar"} conexão direta para ${row.base_url} (${row.owner})?`)) return;
    setBusy(true);
    try {
      await approve({ data: { id: row.id, base_url: row.base_url, approved: !row.approved } });
      await load();
      setMessage(row.approved ? "Aprovação revogada." : "Destino aprovado.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao alterar aprovação."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 border bg-card p-5" aria-label="Aprovação de destinos">
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-primary" />Destinos de roteadores · Master</h2>
      <Button size="icon" variant="outline" aria-label="Atualizar destinos" title="Atualizar destinos" disabled={busy} onClick={() => void load()}><RefreshCw /></Button>
    </div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <ul className="mt-4 divide-y">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto"><p className="font-semibold">{row.name}</p><p className="break-all text-xs text-muted-foreground">{row.owner}</p><p className="break-all font-mono text-xs">{row.base_url}</p></div>
      <Badge variant={row.approved ? "default" : "outline"}>{row.approved ? "Aprovado" : row.valid ? "Aguardando aprovação" : "Endereço inválido"}</Badge>
      <Button size="sm" variant="outline" disabled={busy || !row.valid && !row.approved} onClick={() => void change(row)}>{row.approved ? "Revogar" : "Aprovar destino"}</Button>
    </li>)}</ul>
    {!rows.length && <p className="mt-3 text-sm text-muted-foreground">{busy ? "Carregando…" : "Nenhum roteador com conexão direta."}</p>}
  </section>;
}