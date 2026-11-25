import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getProspectAutomation, saveProspectAutomation } from "@/lib/prospects.functions";
import { automationSchema, nextProspectRun } from "@/lib/prospect-automation";

export function ProspectAutomation() {
  const get = useServerFn(getProspectAutomation), save = useServerFn(saveProspectAutomation);
  const [record, setRecord] = useState<Awaited<ReturnType<typeof getProspectAutomation>>>(null);
  const [enabled, setEnabled] = useState(false), [limit, setLimit] = useState(50), [uf, setUf] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  useEffect(() => {
    void get().then((r) => { setRecord(r); setEnabled(r?.enabled ?? false); setLimit(r?.daily_limit ?? 50); setUf(r?.uf ?? ""); })
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : "Não foi possível carregar a programação."))
      .finally(() => setLoading(false));
  }, []);
  async function submit() {
    const result = automationSchema.safeParse({ enabled, daily_limit: limit, uf });
    if (!result.success) { setMessage("Informe quantidade de 1 a 100 e uma UF com duas letras, ou deixe a UF vazia."); return; }
    setBusy(true); setMessage("");
    try {
      await save({ data: result.data }); setRecord(await get());
      setMessage(enabled ? "Programação salva e ativada." : "Programação salva. Envios automáticos pausados.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  if (loading) return <p className="py-6 text-sm text-muted-foreground">Carregando programação…</p>;
  return <section className="space-y-5 py-4">
    <div className="flex items-center justify-between gap-4 border-b pb-4">
      <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-5 w-5" />Envio diário</h2>
      <label className="flex items-center gap-2 text-sm" htmlFor="automation-enabled">{enabled ? "Ativado" : "Pausado"}<Switch id="automation-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={busy} /></label>
    </div>
    <div className="flex flex-wrap items-end gap-5">
      <label className="space-y-1 text-sm" htmlFor="automation-limit"><span className="block text-muted-foreground">Quantidade por dia</span><Input id="automation-limit" type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-32" /></label>
      <label className="space-y-1 text-sm" htmlFor="automation-uf"><span className="block text-muted-foreground">Estado (opcional)</span><Input id="automation-uf" value={uf} maxLength={2} placeholder="Todas as UFs" onChange={(e) => setUf(e.target.value.toUpperCase())} className="w-40" /></label>
      <div className="text-sm"><p className="text-muted-foreground">Horário diário · Brasília</p><p className="py-2 font-semibold">09:17</p></div>
      <Button disabled={busy} onClick={() => void submit()}><Save />{busy ? "Salvando…" : "Salvar programação"}</Button>
    </div>
    {message && <p role="status" className="rounded-md border bg-muted p-3 text-sm">{message}</p>}
    <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
      <div><dt className="text-muted-foreground">Programação salva</dt><dd className="mt-1 font-medium">{record?.enabled ? "Ativa" : "Pausada"}</dd></div>
      <div><dt className="text-muted-foreground">Próximo envio previsto</dt><dd className="mt-1 font-medium">{record?.enabled ? nextProspectRun(new Date(), record.last_run_day).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</dd></div>
      <div><dt className="text-muted-foreground">Última execução · Brasília</dt><dd className="mt-1">{record?.last_run_at ? new Date(record.last_run_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nenhuma execução"}</dd></div>
      <div><dt className="text-muted-foreground">Resultado do último lote</dt><dd className="mt-1">{record?.last_run_at ? `Aceitos pelo Brevo: ${record.last_sent}. Falhas: ${record.last_failed}.` : "—"}</dd></div>
    </dl>
    {record?.last_error && <p className="break-words text-sm text-destructive">{record.last_error}</p>}
  </section>;
}