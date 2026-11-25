import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Mail, Send, History, Reply, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listUsers } from "@/lib/users.functions";
import { continuation } from "@/lib/user-message-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sendUserEmail, listUserMessages } from "@/lib/user-mail.functions";

export const Route = createFileRoute("/_authenticated/contatar")({
  head: () => ({ meta: [
    { title: "Contatar usuários | Syncron ISP" },
    { name: "description", content: "Envie e-mails diretamente aos usuários do painel." },
    { property: "og:title", content: "Contatar usuários | Syncron ISP" },
    { property: "og:description", content: "Envie e-mails diretamente aos usuários do painel." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

type U = Awaited<ReturnType<typeof listUsers>>[number];

function Page() {
  const list = useServerFn(listUsers), send = useServerFn(sendUserEmail);
  const [users, setUsers] = useState<U[]>([]), [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(""), [subject, setSubject] = useState(""), [body, setBody] = useState("");
  const history = useServerFn(listUserMessages);
  const [messages, setMessages] = useState<Awaited<ReturnType<typeof listUserMessages>>["messages"]>([]);
  const [recipient, setRecipient] = useState("all"), [page, setPage] = useState(0), [total, setTotal] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true), [historyError, setHistoryError] = useState("");
  const [parentId, setParentId] = useState<string | undefined>();
  async function refreshHistory() {
    setLoadingHistory(true); setHistoryError("");
    try {
      const result = await history({ data: { page, ...(recipient === "all" ? {} : { recipientId: recipient }) } });
      setMessages(result.messages); setTotal(result.total);
    } catch (e) { setHistoryError((e as Error).message); }
    finally { setLoadingHistory(false); }
  }
  useEffect(() => { void refreshHistory(); }, [recipient, page]);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { list().then(setUsers).catch((e) => setMsg((e as Error).message)); }, []);
  const shown = useMemo(() => users.filter((u) => u.email && (u.email + " " + u.full_name).toLowerCase().includes(q.toLowerCase())), [users, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((u) => sel.has(u.id));

  async function submit() {
    if (!window.confirm(`Enviar este e-mail para ${sel.size} usuário(s)?`)) return;
    setBusy(true); setMsg("");
    try { const r = await send({ data: { userIds: [...sel], subject, body, ...(parentId ? { parentId } : {}) } }); setMsg(`Enviados: ${r.sent}. Falhas: ${r.failed}. Sem confirmação: ${r.unknown}.${r.lastError ? " Erro: " + r.lastError : ""}`); if (r.sent) { setSubject(""); setBody(""); setSel(new Set()); setParentId(undefined); } await refreshHistory(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Mail className="h-6 w-6 text-primary" />Contatar usuários</h1><p className="text-sm text-muted-foreground">Enviado como Syncron ISP &lt;contato@syncrontelecom.com&gt;. As respostas chegam no seu e-mail.</p></div>
      {msg && <p role="status" className="rounded-md border bg-muted p-3 text-sm">{msg}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 min-w-0">
          <h2 className="font-semibold">1. Escolha os destinatários ({sel.size})</h2>
          <Input placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allOn} onChange={() => setSel((s) => { const n = new Set(s); shown.forEach((u) => allOn ? n.delete(u.id) : n.add(u.id)); return n; })} />Selecionar todos da lista</label>
          <div className="max-h-96 divide-y overflow-auto rounded-md border text-sm">
            {shown.map((u) => <label key={u.id} className="flex cursor-pointer items-center gap-2 p-2 hover:bg-muted"><input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} /><span className="min-w-0 break-words"><span className="font-medium">{u.full_name || "Sem nome"}</span> <span className="text-muted-foreground">{u.email}</span></span></label>)}
            {!shown.length && <p className="p-3 text-muted-foreground">Nenhum usuário.</p>}
          </div>
        </section>
        <section id="message-composer" className="space-y-3 min-w-0">
          <h2 className="font-semibold">2. Escreva a mensagem</h2>
          {parentId && <div className="flex items-center justify-between gap-2 border-l-2 border-primary pl-3 text-sm"><span>Continuação de atendimento</span><Button variant="ghost" size="sm" onClick={() => setParentId(undefined)}>Desvincular</Button></div>}
          <Input aria-label="Assunto" placeholder="Assunto" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Mensagem (o nome do usuário é incluído automaticamente na saudação)" rows={12} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button disabled={busy || !sel.size || !subject.trim() || !body.trim()} onClick={submit}><Send />{busy ? "Enviando…" : `Enviar para ${sel.size}`}</Button>
        </section>
      </div>
      <section className="space-y-4 border-t pt-6" aria-label="Histórico de atendimentos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><History className="h-5 w-5" />Histórico de atendimentos</h2>
          <div className="flex items-center gap-2">
            <Select value={recipient} onValueChange={(v) => { setRecipient(v); setPage(0); }}>
              <SelectTrigger className="w-56 max-w-full" aria-label="Filtrar histórico por usuário"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos os usuários</SelectItem>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" title="Atualizar histórico" aria-label="Atualizar histórico" disabled={loadingHistory} onClick={() => void refreshHistory()}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>
        {historyError && <p role="alert" className="text-destructive">{historyError}</p>}
        {loadingHistory ? <p className="text-sm text-muted-foreground">Carregando atendimentos…</p> : !messages.length ? <p className="text-sm text-muted-foreground">Nenhuma mensagem registrada.</p> : <div className="divide-y">
          {messages.map((m) => <article key={m.id} className="space-y-3 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="break-words font-semibold">{m.subject}</h3><p className="break-all text-sm text-muted-foreground">{m.recipient_name || "Sem nome"} · {m.recipient_email}</p><time className="text-xs text-muted-foreground" dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("pt-BR")}</time></div>
              <span className={`inline-flex items-center gap-1 text-sm ${m.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{m.status === "sent" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4" />}{m.status === "sent" ? "Mensagem enviada · aceita pelo Brevo" : m.status === "failed" ? "Falha no envio" : "Envio sem confirmação"}</span>
            </div>
            {m.parent_id && <p className="text-xs text-muted-foreground">Continuação de atendimento</p>}
            <details><summary className="cursor-pointer text-sm text-primary">Ver mensagem</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{m.body}</p></details>
            {m.error && <p className="break-words text-sm text-destructive">{m.error}</p>}
            <Button variant="outline" size="sm" disabled={busy || !users.some((u) => u.id === m.recipient_id)} onClick={() => {
              if ((subject.trim() || body.trim()) && !window.confirm("Substituir o rascunho atual para continuar este atendimento?")) return;
              const next = continuation(m); setSel(new Set(next.userIds)); setSubject(next.subject); setBody(""); setParentId(next.parentId);
              document.getElementById("message-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}><Reply className="h-4 w-4" />Continuar atendimento</Button>
          </article>)}
        </div>}
        {total > 20 && <div className="flex items-center justify-end gap-3 text-sm"><Button variant="outline" size="icon" aria-label="Página anterior" disabled={loadingHistory || page === 0} onClick={() => setPage((p) => p - 1)}><ArrowLeft /></Button><span>Página {page + 1} de {Math.ceil(total / 20)}</span><Button variant="outline" size="icon" aria-label="Próxima página" disabled={loadingHistory || (page + 1) * 20 >= total} onClick={() => setPage((p) => p + 1)}><ArrowRight /></Button></div>}
      </section>
    </div>
  );
}
