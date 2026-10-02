import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, KeyRound, Mail, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadBackup, generateOnpremSyncToken, getBackupSettings, getOnpremSyncInfo, restoreBackup, saveBackupEmail, sendBackupNow } from "@/lib/backup.functions";
import { approveOnpremPairing, getCloudPairingState, requestCloudPairing, type CloudPairingState } from "@/lib/onprem-pair.functions";

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

// No servidor instalado (on-premise) o painel roda com projeto "local".
const IS_LOCAL = import.meta.env.VITE_SUPABASE_PROJECT_ID === "local";

function BackupPage() {
  const get = useServerFn(getBackupSettings);
  const save = useServerFn(saveBackupEmail);
  const send = useServerFn(sendBackupNow);
  const dl = useServerFn(downloadBackup);
  const restore = useServerFn(restoreBackup);
  const fileRef = useRef<HTMLInputElement>(null);
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
      <section className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Restaurar backup</h2>
        <p className="text-xs text-muted-foreground">Escolha o arquivo JSON que chegou no seu e-mail (ou que você baixou). Os registros do arquivo são recriados ou atualizados na sua conta. Senhas de roteadores e chaves de bancos não voltam, por segurança — recadastre-as depois.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!window.confirm(`Restaurar o backup "${f.name}"? Registros existentes com o mesmo código serão atualizados.`)) return;
          run(async () => {
            const json = await f.text();
            const r = await restore({ data: { json } });
            const total = Object.values(r.restored).reduce((a, b) => a + b, 0);
            setMsg({ ok: true, text: `Backup restaurado: ${total} registros importados.` });
          }, "");
        }} />
        <Button variant="outline" disabled={busy || !isOwner} onClick={() => fileRef.current?.click()}><Upload />Escolher arquivo e restaurar</Button>
      </section>
      {isOwner && (IS_LOCAL ? <CloudPairingCard /> : <><OnpremPairingApproval /><OnpremSync /></>)}
      {msg && <p className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
    </main>
  );
}

// Painel ONLINE: autorizar o servidor local pelo código de 6 números (sem colar chaves no terminal).
function OnpremPairingApproval() {
  const approve = useServerFn(approveOnpremPairing);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Autorizar servidor local</h2>
      <p className="text-xs text-muted-foreground">No servidor instalado na sua rede, abra a página Backup, clique em “Conectar com a nuvem” e digite aqui o código de 6 números que aparecer. Ele vale por 15 minutos e o servidor conecta sozinho logo depois.</p>
      {done ? (
        <p className="text-sm text-primary">Servidor autorizado! Em até 1 minuto ele se conecta e começa a copiar os dados a cada 15 minutos.</p>
      ) : (
        <div className="flex gap-2">
          <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-32 tracking-[0.3em]" />
          <Button disabled={busy || code.length !== 6} onClick={async () => { setBusy(true); setErr(null); try { await approve({ data: { code } }); setDone(true); } catch (e) { setErr((e as Error).message); } setBusy(false); }}>Autorizar</Button>
        </div>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </section>
  );
}

// Painel LOCAL: pedir o código e mostrar a situação da conexão com a nuvem.
function CloudPairingCard() {
  const info = useServerFn(getOnpremSyncInfo);
  const gen = useServerFn(generateOnpremSyncToken);
  const [state, setState] = useState<{ exists: boolean; last_used_at: string | null } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { info().then(setState).catch(() => {}); }, []);
  const panel = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <section className="space-y-3 rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Sincronizar com servidor local</h2>
      <p className="text-xs text-muted-foreground">O servidor instalado na sua rede copia daqui, a cada 15 minutos, clientes, planos, roteadores, rede FTTH e cobranças. Gere a chave e rode o comando no servidor local. Gerar de novo invalida a chave anterior.</p>
      <p className="text-xs text-muted-foreground">Situação: {state?.exists ? `chave ativa · última cópia ${state.last_used_at ? new Date(state.last_used_at).toLocaleString("pt-BR") : "ainda não feita"}` : "nenhuma chave gerada"}</p>
      <Button variant="outline" onClick={async () => { setErr(null); try { const r = await gen(); setToken(r.token); setState({ exists: true, last_used_at: null }); } catch (e) { setErr((e as Error).message); } }}><KeyRound />{state?.exists ? "Gerar nova chave" : "Gerar chave"}</Button>
      {token && (
        <div className="space-y-1">
          <p className="text-xs font-semibold">Rode no servidor local (a chave aparece só agora):</p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{`sudo nexora-sync-setup ${panel} ${token}`}</pre>
        </div>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </section>
  );
}
