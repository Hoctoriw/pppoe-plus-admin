import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Gauge, Server, Cloud, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyLicense } from "@/lib/users.functions";
import { listRadiusAppliances } from "@/lib/radius-appliance.functions";

export const Route = createFileRoute("/_authenticated/velocidade")({
  head: () => ({
    meta: [
      { title: "Teste de velocidade — Syncron ISP" },
      { name: "description", content: "Meça ping, download e upload da rede local e da internet." },
      { property: "og:title", content: "Teste de velocidade — Syncron ISP" },
      { property: "og:description", content: "Velocímetro de rede local e externa do Syncron ISP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpeedPage,
});

type Res = { ping: number; jitter: number; down: number; up: number };

async function runTest(onLive: (phase: string, mbps: number) => void): Promise<Res> {
  const { data } = await supabase.auth.getSession();
  const h = { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
  const base = "/api/public/speedtest";
  const pings: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = performance.now();
    const r = await fetch(`${base}?ping=1&r=${Math.random()}`, { headers: h, cache: "no-store" });
    if (r.status === 403) throw new Error("Teste de velocidade não liberado para esta conta.");
    pings.push(performance.now() - t);
  }
  pings.sort((a, b) => a - b);
  const ping = pings[0] ?? 0;
  const jitter = pings.slice(1).reduce((s, p, i, arr) => s + Math.abs(p - (i ? arr[i - 1]! : ping)), 0) / (pings.length - 1);

  // Download: 4 conexões paralelas por ~8s
  let bytes = 0; const t0 = performance.now(); const until = t0 + 8000;
  const dl = async () => {
    while (performance.now() < until) {
      const r = await fetch(`${base}?bytes=25000000&r=${Math.random()}`, { headers: h, cache: "no-store" });
      const rd = r.body!.getReader();
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        bytes += value.length; onLive("Download", (bytes * 8) / ((performance.now() - t0) * 1000));
        if (performance.now() > until) { void rd.cancel(); break; }
      }
    }
  };
  await Promise.all([dl(), dl(), dl(), dl()]);
  const down = (bytes * 8) / ((performance.now() - t0) * 1000);

  // Upload: blocos de 4 MB em 3 conexões por ~8s
  const blob = new Uint8Array(4_000_000); crypto.getRandomValues(blob.subarray(0, 65536));
  let ub = 0; const u0 = performance.now(); const uend = u0 + 8000;
  const ul = async () => { while (performance.now() < uend) { await fetch(`${base}?r=${Math.random()}`, { method: "POST", headers: h, body: blob }); ub += blob.length; onLive("Upload", (ub * 8) / ((performance.now() - u0) * 1000)); } };
  await Promise.all([ul(), ul(), ul()]);
  const up = (ub * 8) / ((performance.now() - u0) * 1000);
  return { ping, jitter, down, up };
}

function Dial({ value, label }: { value: number; label: string }) {
  const max = 1000; const pct = Math.min(Math.log10(1 + value) / Math.log10(1 + max), 1);
  const angle = -120 + pct * 240;
  return (
    <svg viewBox="0 0 200 140" className="mx-auto w-full max-w-sm">
      <path d="M 25 120 A 80 80 0 1 1 175 120" fill="none" className="stroke-muted" strokeWidth="14" strokeLinecap="round" />
      <path d="M 25 120 A 80 80 0 1 1 175 120" fill="none" className="stroke-primary transition-all" strokeWidth="14" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct * 100} 100`} />
      <line x1="100" y1="100" x2="100" y2="38" className="stroke-foreground transition-transform duration-300" strokeWidth="3" strokeLinecap="round" style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px" }} />
      <circle cx="100" cy="100" r="6" className="fill-foreground" />
      <text x="100" y="128" textAnchor="middle" className="fill-foreground text-[22px] font-bold">{value.toFixed(1)}</text>
      <text x="100" y="139" textAnchor="middle" className="fill-muted-foreground text-[8px]">{label} · Mbps</text>
    </svg>
  );
}

function SpeedPage() {
  const lic = useServerFn(getMyLicense), apps = useServerFn(listRadiusAppliances);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [servers, setServers] = useState<{ hostname: string; local_ip: string | null }[]>([]);
  const [live, setLive] = useState({ phase: "Pronto", mbps: 0 });
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { lic().then((l) => setAllowed(l.speedtest)).catch(() => setAllowed(false)); apps().then(setServers).catch(() => {}); }, []);

  const start = async () => {
    setBusy(true); setErr(""); setRes(null); setLive({ phase: "Ping", mbps: 0 });
    try { const r = await runTest((phase, mbps) => setLive({ phase, mbps })); setRes(r); setLive({ phase: "Concluído", mbps: r.down }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Falha no teste."); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link>
      <div className="flex items-center gap-3"><img src="/syncron-logo.png" alt="Syncron ISP" width={56} height={56} className="h-14 w-14" /><div><div className="text-sm font-extrabold tracking-wide">SYNCRON <span className="text-primary">ISP</span></div><h1 className="flex items-center gap-2 text-2xl font-bold"><Gauge className="h-6 w-6 text-primary" />Teste de velocidade</h1></div></div>
      {allowed === false ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">O teste de velocidade não está liberado para esta conta. Fale com o administrador do Syncron ISP.</p>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Cloud className="h-5 w-5" />Internet (externo)</h2>
            <Dial value={live.mbps} label={live.phase} />
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[["Ping", res ? `${res.ping.toFixed(0)} ms` : "—"], ["Jitter", res ? `${res.jitter.toFixed(0)} ms` : "—"], ["Download", res ? `${res.down.toFixed(1)} Mbps` : "—"], ["Upload", res ? `${res.up.toFixed(1)} Mbps` : "—"]].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">{k}</div><div className="text-lg font-bold">{v}</div></div>
              ))}
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button onClick={start} disabled={busy || allowed !== true} className="w-full">{busy ? `Testando ${live.phase}…` : "Iniciar teste"}</Button>
          </section>
          <section className="space-y-3 rounded-xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-semibold"><Server className="h-5 w-5" />Rede local (servidor Syncron)</h2>
            <p className="text-sm text-muted-foreground">Mede a velocidade entre seu dispositivo e o servidor local, sem usar o link de internet. Abra estando conectado à rede do provedor.</p>
            {servers.filter((s) => s.local_ip).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum servidor local encontrado.</p> :
              servers.filter((s) => s.local_ip).map((s) => (
                <a key={s.hostname + s.local_ip} href={`http://${s.local_ip}/speedtest/`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border p-3 text-sm hover:border-primary"><span className="font-medium">{s.hostname}</span><span className="text-muted-foreground">http://{s.local_ip}/speedtest/</span></a>
              ))}
          </section>
        </>
      )}
    </main>
  );
}
