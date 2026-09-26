import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Mail, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadBackup, getBackupSettings, restoreBackup, saveBackupEmail, sendBackupNow } from "@/lib/backup.functions";

export const Route = createFileRoute("/_authenticated/backup")({
  head: () => ({
    meta: [
      { title: "Backup — Nexora ISP" },
      { name: "description", content: "Envie o backup das configurações do painel para o seu e-mail." },
      { property: "og:title", content: "Backup — Nexora ISP" },
      { property: "og:description", content: "Backup das configurações do provedor por e-mail." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

function BackupPage() {
  const get = useServerFn(getBackupSettings);
  const save = useServerFn(saveBackupEmail);
  const send = useServerFn(sendBackupNow);
  const dl = useServerFn(downloadBackup);
  const [email, setEmail] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { get().then((r) => { setEmail(r.email); setLast(r.last_sent_at); setIsOwner(r.isOwner); }); }, []);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao painel</Link>
      <div>
        <h1 className="text-2xl font-extrabold">Backup</h1>
        <p className="text-sm text-muted-foreground">Envie uma cópia de clientes, planos, roteadores, bancos, cobranças e equipamentos para o seu e-mail. Senhas de roteadores e chaves de bancos não são incluídas, por segurança.</p>
      </div>
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <label className="text-sm font-semibold">E-mail que recebe o backup</label>
        <div className="flex gap-2">
          <Input type="email" value={email} disabled={!isOwner} onChange={(e) => setEmail(e.target.value)} placeholder="voce@empresa.com.br" />
          <Button disabled={busy || !isOwner} onClick={() => run(async () => { await save({ data: { email } }); }, "E-mail salvo.")}><Save />Salvar</Button>
        </div>
        <p className="text-xs text-muted-foreground">Último envio: {last ? new Date(last).toLocaleString("pt-BR") : "nunca"}</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => run(async () => { if (!email.trim()) throw new Error("Digite o e-mail que vai receber o backup."); if (isOwner) await save({ data: { email: email.trim() } }); await send(); setLast(new Date().toISOString()); }, "Backup enviado para o e-mail.")}><Mail />Enviar backup agora</Button>
        <Button variant="outline" disabled={busy} onClick={() => run(async () => {
          const json = await dl();
          const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
          const a = document.createElement("a"); a.href = url; a.download = `backup-nexora-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
        }, "Backup baixado.")}><Download />Baixar backup</Button>
      </div>
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
    </main>
  );
}
