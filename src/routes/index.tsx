import { createFileRoute, Link } from "@tanstack/react-router";
import { Wifi, Router, Network, Receipt, Map, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const URL = "https://rede.syncrontelecom.com/";
const TITLE = "Syncron ISP | Sistema para provedor de internet";
const DESC = "Sistema de gestão para provedores: PPPoE, RADIUS, MikroTik, boletos, Pix e mapa FTTH. Teste grátis por 7 dias.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org", "@type": "SoftwareApplication",
        name: "Syncron ISP", applicationCategory: "BusinessApplication", operatingSystem: "Web",
        description: DESC, url: URL,
        offers: { "@type": "Offer", price: "100", priceCurrency: "BRL" },
      }),
    }],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Wifi, t: "PPPoE, IPoE e Hotspot", d: "Autenticação RADIUS com IP fixo e bloqueio automático de inadimplentes." },
  { icon: Router, t: "Integração MikroTik", d: "Controle seus roteadores pelo painel, até com IP local via servidor Syncron." },
  { icon: Receipt, t: "Financeiro", d: "Boletos e Pix com baixa automática e central do assinante." },
  { icon: Map, t: "Mapa da Rede FTTH", d: "OLT, CEO, CTO, splitters, fibras e sinal de cada caixa no mapa." },
  { icon: Network, t: "Conexões em tempo real", d: "Veja quem está conectado ou desconectado no mapa." },
  { icon: ShieldCheck, t: "Backup diário", d: "Seus dados guardados todo dia, com restauração simples." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/syncron-logo.png" alt="Syncron ISP" className="h-8 w-8" /> Syncron ISP
        </div>
        <Button asChild variant="outline"><Link to="/auth">Entrar</Link></Button>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Sistema completo para provedor de internet</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Gerencie clientes, planos, MikroTik, RADIUS, cobranças e sua rede de fibra em um só painel. Uma alternativa moderna ao MK-AUTH.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg"><Link to="/auth">Testar grátis por 7 dias</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#recursos">Ver recursos</a></Button>
          </div>
        </section>
        <section id="recursos" className="mx-auto max-w-6xl px-6 pb-20">
          <h2 className="mb-8 text-center text-2xl font-semibold">O que o Syncron ISP faz pelo seu provedor</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: I, t, d }) => (
              <article key={t} className="rounded-xl border bg-card p-6">
                <I className="h-6 w-6 text-primary" />
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="border-t bg-card px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold">Planos a partir de R$ 100/mês</h2>
          <p className="mt-2 text-muted-foreground">Mensal R$ 100 ou anual R$ 1.000, com a Rede FTTH inclusa.</p>
          <Button asChild size="lg" className="mt-6"><Link to="/auth">Criar minha conta</Link></Button>
        </section>
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground">© Syncron Telecom</footer>
    </div>
  );
}
