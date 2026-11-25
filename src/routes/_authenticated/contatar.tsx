import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listUsers } from "@/lib/users.functions";
import { sendUserEmail } from "@/lib/user-mail.functions";

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
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { list().then(setUsers).catch((e) => setMsg((e as Error).message)); }, []);
  const shown = useMemo(() => users.filter((u) => u.email && (u.email + " " + u.full_name).toLowerCase().includes(q.toLowerCase())), [users, q]);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((u) => sel.has(u.id));

  async function submit() {
    if (!window.confirm(`Enviar este e-mail para ${sel.size} usuário(s)?`)) return;
    setBusy(true); setMsg("");
    try { const r = await send({ data: { userIds: [...sel], subject, body } }); setMsg(`Enviados: ${r.sent}. Falhas: ${r.failed}.${r.lastError ? " Erro: " + r.lastError : ""}`); if (r.sent) { setSubject(""); setBody(""); setSel(new Set()); } }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link to="/usuarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar para Usuários</Link>
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Mail className="h-6 w-6 text-primary" />Contatar usuários</h1><p className="text-sm text-muted-foreground">Enviado como Syncron ISP &lt;contato@syncrontelecom.com&gt;. As respostas chegam no seu e-mail.</p></div>
      {msg && <p className="rounded-md border bg-muted p-3 text-sm">{msg}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">1. Escolha os destinatários ({sel.size})</h2>
          <Input placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allOn} onChange={() => setSel((s) => { const n = new Set(s); shown.forEach((u) => allOn ? n.delete(u.id) : n.add(u.id)); return n; })} />Selecionar todos da lista</label>
          <div className="max-h-96 divide-y overflow-auto rounded-md border text-sm">
            {shown.map((u) => <label key={u.id} className="flex cursor-pointer items-center gap-2 p-2 hover:bg-muted"><input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} /><span><span className="font-medium">{u.full_name || "Sem nome"}</span> <span className="text-muted-foreground">{u.email}</span></span></label>)}
            {!shown.length && <p className="p-3 text-muted-foreground">Nenhum usuário.</p>}
          </div>
        </section>
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">2. Escreva a mensagem</h2>
          <Input placeholder="Assunto" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Mensagem (o nome do usuário é incluído automaticamente na saudação)" rows={12} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button disabled={busy || !sel.size || !subject.trim() || !body.trim()} onClick={submit}><Send />{busy ? "Enviando…" : `Enviar para ${sel.size}`}</Button>
        </section>
      </div>
    </div>
  );
}
