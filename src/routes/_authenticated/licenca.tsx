import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PixCheckout } from "@/components/PixCheckout";
import { getMyLicense } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/licenca")({
  head: () => ({ meta: [
    { title: "Minha licença | Syncron ISP" },
    { name: "description", content: "Veja a validade da sua licença e renove via Pix." },
    { property: "og:title", content: "Minha licença | Syncron ISP" },
    { property: "og:description", content: "Veja a validade da sua licença e renove via Pix." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: LicensePage,
});

function LicensePage() {
  const fetchLicense = useServerFn(getMyLicense);
  const [lic, setLic] = useState<Awaited<ReturnType<typeof getMyLicense>> | null>(null);
  useEffect(() => { fetchLicense().then(setLic).catch(() => {}); }, []);
  const days = lic?.expires_at ? Math.ceil((new Date(lic.expires_at).getTime() - Date.now()) / 86400000) : null;
  return <div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-3xl">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao painel</Link>
    <h1 className="mt-4 flex items-center gap-2 text-3xl font-extrabold"><KeyRound className="text-primary" />Minha licença</h1>
    <section className="mt-6 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Situação</p><p className="mt-1">{!lic ? "…" : lic.admin ? <Badge>Administrador</Badge> : lic.valid ? <Badge>Ativa</Badge> : <Badge variant="destructive">Expirada</Badge>}</p></div>
      <div><p className="text-xs text-muted-foreground">Válida até</p><p className="mt-1 font-bold">{lic?.admin ? "Sem vencimento" : lic?.expires_at ? new Date(lic.expires_at).toLocaleDateString("pt-BR") : "—"}</p>{days !== null && days > 0 && <p className="text-xs text-muted-foreground">{days} dia(s) restantes</p>}</div>
      <div><p className="text-xs text-muted-foreground">Rede FTTH</p><p className="mt-1">{lic?.network ? <Badge>Liberada</Badge> : <Badge variant="secondary">Não incluída</Badge>}</p></div>
    </section>
    {!lic?.admin && <section className="mt-6 rounded-xl border bg-card p-5">
      <p className="font-bold">Renovar ou mudar de plano</p>
      <p className="mb-4 text-sm text-muted-foreground">Escolha um plano e pague via Pix. Os dias pagos são somados à validade atual.</p>
      <PixCheckout />
    </section>}
  </div></div>;
}
