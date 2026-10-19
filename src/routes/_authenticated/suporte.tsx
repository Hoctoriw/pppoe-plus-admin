import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Copy, LifeBuoy, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const SUPPORT_EMAIL = "suporte@syncrontelecom.com.br";

export const Route = createFileRoute("/_authenticated/suporte")({
  head: () => ({ meta: [
    { title: "Suporte | Syncron ISP" },
    { name: "description", content: "Fale com o suporte do Syncron ISP por e-mail." },
    { property: "og:title", content: "Suporte | Syncron ISP" },
    { property: "og:description", content: "Fale com o suporte do Syncron ISP por e-mail." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: SupportPage,
});

function SupportPage() {
  const copy = () => { navigator.clipboard.writeText(SUPPORT_EMAIL); toast.success("E-mail copiado"); };
  return <div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-3xl">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar ao painel</Link>
    <h1 className="mt-4 flex items-center gap-2 text-3xl font-extrabold"><LifeBuoy className="text-primary" />Suporte</h1>
    <p className="mt-2 text-muted-foreground">Dúvidas sobre MikroTik, servidor RADIUS, licença ou financeiro? Fale com a gente por e-mail.</p>
    <section className="mt-6 rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">E-mail de suporte</p>
      <p className="mt-1 break-all text-xl font-bold">{SUPPORT_EMAIL}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Suporte Syncron ISP")}`}><Mail />Enviar e-mail</a></Button>
        <Button variant="outline" onClick={copy}><Copy />Copiar e-mail</Button>
      </div>
    </section>
    <section className="mt-6 rounded-xl border bg-card p-5 text-sm">
      <p className="font-bold">Para agilizar o atendimento, informe:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>O e-mail da sua conta no painel</li>
        <li>O que estava fazendo e a mensagem de erro (um print ajuda)</li>
        <li>Nome do roteador ou cliente envolvido, se houver</li>
      </ul>
    </section>
  </div></div>;
}
