import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useEffect, useState } from "react";
import { Copy, Download, FileText, LogOut, Radio, Upload, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { portalData, portalLogin } from "@/lib/portal.functions";

export const Route = createFileRoute("/central")({
  head: () => ({ meta: [
    { title: "Central do Assinante | Nexora ISP" },
    { name: "description", content: "Consulte seu plano, consumo e boletos para pagamento." },
    { property: "og:title", content: "Central do Assinante | Nexora ISP" },
    { property: "og:description", content: "Consulte seu plano, consumo e boletos para pagamento." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Central,
});

type Data = Awaited<ReturnType<typeof portalData>>;
const KEY = "nexora_central";
const gb = (b: number) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1e6).toFixed(1)} MB`;
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Central() {
  const login = useServerFn(portalLogin), load = useServerFn(portalData);
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = sessionStorage.getItem(KEY); if (t) setToken(t); }, []);
  useEffect(() => {
    if (!token) return;
    load({ data: { token } }).then(setData).catch(e => { setMsg(e instanceof Error ? e.message : "Erro"); sessionStorage.removeItem(KEY); setToken(null); });
  }, [token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await login({ data: { document: String(f.get("doc")), password: String(f.get("pw")) } });
      sessionStorage.setItem(KEY, r.token); setToken(r.token);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Erro ao entrar"); }
    setBusy(false);
  }
  function sair() { sessionStorage.removeItem(KEY); setToken(null); setData(null); }

  if (!token || !data) return <main className="flex min-h-screen items-center justify-center bg-background px-6">
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <div className="flex items-center gap-2 text-lg font-extrabold"><Radio className="text-primary" />Central do Assinante</div>
      <p className="text-sm text-muted-foreground">Entre com seu CPF/CNPJ e a senha da sua conexão (a mesma do roteador/Wi‑Fi do provedor).</p>
      <div className="space-y-2"><Label htmlFor="doc">CPF/CNPJ</Label><Input id="doc" name="doc" required inputMode="numeric" /></div>
      <div className="space-y-2"><Label htmlFor="pw">Senha</Label><Input id="pw" name="pw" type="password" required /></div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <Button className="h-11 w-full" disabled={busy || (!!token && !data)}>{token && !data ? "Carregando…" : "Entrar"}</Button>
    </form>
  </main>;

  const c = data.customer as any;
  const p = c.plans;
  const open = data.invoices.filter(i => i.status !== "paid" && i.status !== "cancelled");
  return <main className="mx-auto min-h-screen max-w-4xl bg-background px-5 py-8">
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-lg font-extrabold"><Radio className="text-primary" />Central do Assinante</div>
      <Button variant="outline" size="sm" onClick={sair}><LogOut />Sair</Button>
    </header>
    <h1 className="mt-6 text-2xl font-extrabold">Olá, {String(c.full_name).split(" ")[0]}</h1>
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <div className="border bg-card p-5"><p className="text-xs text-muted-foreground">Plano</p><p className="mt-1 text-lg font-bold">{p?.name ?? "—"}</p><p className="text-sm text-muted-foreground">{p ? `${p.download_mbps}/${p.upload_mbps} Mbps · ${brl(p.monthly_price)}` : ""}</p></div>
      <div className="border bg-card p-5"><p className="text-xs text-muted-foreground">Situação</p><p className="mt-1 flex items-center gap-2 text-lg font-bold"><Wifi className="h-4 w-4 text-primary" />{c.status === "active" ? "Ativo" : c.status === "suspended" ? "Bloqueado" : c.status}</p><p className="text-sm text-muted-foreground">{c.online ? "Conectado agora" : "Desconectado"}{c.due_day ? ` · vence dia ${c.due_day}` : ""}</p></div>
      <div className="border bg-card p-5"><p className="text-xs text-muted-foreground">Consumo da conexão atual</p><p className="mt-1 flex items-center gap-2 text-sm"><Download className="h-4 w-4 text-primary" />{gb(c.acct_output_bytes ?? 0)}<Upload className="ml-2 h-4 w-4 text-primary" />{gb(c.acct_input_bytes ?? 0)}</p><p className="text-xs text-muted-foreground">{c.acct_updated_at ? `Atualizado ${new Date(c.acct_updated_at).toLocaleString("pt-BR")} · ${Math.round((c.acct_session_time ?? 0) / 3600)}h online` : "Sem dados ainda"}</p></div>
    </div>
    <section className="mt-8">
      <h2 className="font-bold">Faturas {open.length > 0 && <Badge className="ml-2">{open.length} em aberto</Badge>}</h2>
      <ul className="mt-3 space-y-3">{data.invoices.map(i => <li key={i.id} className="border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <FileText className="h-4 w-4 text-primary" /><span className="font-semibold">{brl(i.amount)}</span>
          <span className="text-sm text-muted-foreground">vence {new Date(i.due_date + "T12:00").toLocaleDateString("pt-BR")}</span>
          <Badge variant={i.status === "paid" ? "secondary" : i.status === "overdue" ? "destructive" : "outline"} className="ml-auto">{i.status === "paid" ? "Pago" : i.status === "overdue" ? "Vencido" : i.status === "cancelled" ? "Cancelado" : "Em aberto"}</Badge>
        </div>
        {i.status !== "paid" && i.status !== "cancelled" && <div className="mt-3 flex flex-wrap gap-2">
          {i.linha_digitavel && <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(i.linha_digitavel!)}><Copy />Copiar código do boleto</Button>}
          {i.boleto_url && <Button size="sm" asChild><a href={i.boleto_url} target="_blank" rel="noreferrer">Abrir boleto / Pix</a></Button>}
          {!i.linha_digitavel && !i.boleto_url && <span className="text-xs text-muted-foreground">Boleto ainda não emitido. Fale com o provedor.</span>}
        </div>}
      </li>)}{!data.invoices.length && <li className="text-sm text-muted-foreground">Nenhuma fatura.</li>}</ul>
    </section>
  </main>;
}
