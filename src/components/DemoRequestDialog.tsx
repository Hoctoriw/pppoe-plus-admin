import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { requestDemo } from "@/lib/demo.functions";

const SIZES = ["até 200", "200 a 1.000", "mais de 1.000"] as const;

export function DemoRequestDialog({ variant = "secondary" as "secondary" | "outline" | "default", size = "lg" as "lg" | "default" }) {
  const send = useServerFn(requestDemo);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", company: "", whatsapp: "", email: "", size: "até 200" as (typeof SIZES)[number] });
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try { await send({ data: f }); setDone(true); } catch { setErr("Confira os dados (WhatsApp com DDD e e-mail válido) e tente novamente."); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDone(false); }}>
      <DialogTrigger asChild><Button size={size} variant={variant}>Solicitar demonstração</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar demonstração</DialogTitle>
          <DialogDescription>Receba os vídeos no seu e-mail e fale com a nossa equipe.</DialogDescription>
        </DialogHeader>
        {done ? <p className="py-4 text-sm">Pronto! Enviamos a demonstração para <b>{f.email}</b>. Em breve entraremos em contato pelo WhatsApp.</p> : (
          <form onSubmit={submit} className="space-y-3">
            <Input required maxLength={100} placeholder="Seu nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <Input required maxLength={120} placeholder="Nome do provedor" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            <Input required maxLength={20} inputMode="tel" placeholder="WhatsApp com DDD" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
            <Input required type="email" maxLength={255} placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={f.size} onChange={(e) => setF({ ...f, size: e.target.value as (typeof SIZES)[number] })}>
              {SIZES.map((s) => <option key={s} value={s}>{s} clientes</option>)}
            </select>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enviando..." : "Quero a demonstração"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
