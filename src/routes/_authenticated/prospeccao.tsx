import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importProspects, prospectStats, sendProspectBatch, unsubscribeProspect } from "@/lib/prospects.functions";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  head: () => ({ meta: [
    { title: "Prospecção por e-mail | Syncron ISP" },
    { name: "description", content: "Envio de e-mails demonstrativos para provedores via Brevo." },
    { property: "og:title", content: "Prospecção por e-mail | Syncron ISP" },
    { property: "og:description", content: "Envio de e-mails demonstrativos para provedores via Brevo." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

type Stats = Awaited<ReturnType<typeof prospectStats>>;
const pick = (r: Record<string, unknown>, keys: string[]) => { for (const k of Object.keys(r)) if (keys.some((x) => k.toLowerCase().includes(x))) return String(r[k] ?? ""); return ""; };

function Page() {
  const imp = useServerFn(importProspects), stats = useServerFn(prospectStats), send = useServerFn(sendProspectBatch), unsub = useServerFn(unsubscribeProspect);
  const [s, setS] = useState<Stats | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(50), [uf, setUf] = useState(""), [out, setOut] = useState("");
  async function load() { try { setS(await stats()); } catch (e) { setMsg((e as Error).message); } }
  useEffect(() => { void load(); }, []);
  async function run(fn: () => Promise<string>) { setBusy(true); setMsg(""); try { setMsg(await fn()); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } }

  async function onFile(f: File) {
    await run(async () => {
      const wb = XLSX.read(await f.arrayBuffer());
      const sheet = wb.Sheets["Todos"] ?? wb.Sheets[wb.SheetNames[0]!]!;
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const rows = raw.map((r) => ({ email: pick(r, ["e-mail", "email"]).split(/[;,\s]/)[0] ?? "", company: pick(r, ["fantasia"]) || pick(r, ["razão", "razao", "empresa"]), city: pick(r, ["cidade", "munic"]), uf: pick(r, ["uf"]).slice(0, 2) })).filter((r) => r.email.includes("@"));
      let valid = 0, added = 0;
      for (let i = 0; i < rows.length; i += 3000) { const r = await imp({ data: { rows: rows.slice(i, i + 3000) } }); valid += r.valid; added += r.added; }
      return `Importados ${added} novos contatos (${valid} válidos na planilha).`;
    });
  }

  const c = s?.counts;
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
      <div><h1 className="text-2xl font-bold">Prospecção por e-mail</h1><p className="text-sm text-muted-foreground">Enviado pelo Brevo como Syncron ISP &lt;contato@syncrontelecom.com&gt;. Recomendado: até 50–100 por dia.</p></div>
      {msg && <p className="rounded-md border bg-muted p-3 text-sm">{msg}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["pendente", "enviado", "falhou", "descadastrado"] as const).map((k) => <div key={k} className="rounded-lg border p-4"><p className="text-xs uppercase text-muted-foreground">{k}</p><p className="text-2xl font-bold">{c?.[k] ?? "—"}</p></div>)}
      </div>
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold">1. Importar planilha (Anatel ou CSV)</h2>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"><Upload className="h-4 w-4" />Escolher arquivo .xlsx/.csv
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }} /></label>
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">2. Enviar lote</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div><p className="text-xs text-muted-foreground">Quantidade (máx. 100)</p><Input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="w-28" /></div>
          <div><p className="text-xs text-muted-foreground">Estado (opcional)</p><Input value={uf} maxLength={2} placeholder="SP" onChange={(e) => setUf(e.target.value.toUpperCase())} className="w-20" /></div>
          <Button disabled={busy || !c?.["pendente"]} onClick={() => run(async () => { const r = await send({ data: { limit, ...(uf ? { uf } : {}) } }); return `Enviados: ${r.sent}. Falhas: ${r.failed}.${r.lastError ? " Último erro: " + r.lastError : ""}`; })}><Send />{busy ? "Enviando…" : "Enviar agora"}</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold">Descadastrar (quem respondeu SAIR)</h2>
        <div className="flex gap-2"><Input value={out} onChange={(e) => setOut(e.target.value)} placeholder="email@provedor.com" className="max-w-xs" /><Button variant="outline" disabled={busy || !out} onClick={() => run(async () => { await unsub({ data: { email: out } }); setOut(""); return "Descadastrado."; })}>Descadastrar</Button></div>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Últimos envios</h2>
        <div className="divide-y rounded-lg border text-sm">
          {(s?.recent ?? []).length === 0 && <p className="p-3 text-muted-foreground">Nenhum envio ainda.</p>}
          {s?.recent.map((r) => <div key={r.email} className="flex flex-wrap justify-between gap-2 p-3"><span>{r.company || r.email} <span className="text-muted-foreground">{r.email} {r.uf}</span></span><span className={r.status === "falhou" ? "text-destructive" : "text-muted-foreground"} title={r.error ?? ""}>{r.status}{r.sent_at ? " · " + new Date(r.sent_at).toLocaleString("pt-BR") : ""}</span></div>)}
        </div>
      </section>
    </div>
  );
}
