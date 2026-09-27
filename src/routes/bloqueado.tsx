import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, MessageCircle, Phone, RefreshCw, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

type Search = { empresa?: string; telefone?: string; whatsapp?: string; motivo?: string };

const TITLE = "Acesso bloqueado";
const DESC = "Sua conexão está temporariamente bloqueada. Veja como regularizar e voltar a navegar.";

export const Route = createFileRoute("/bloqueado")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    empresa: typeof s.empresa === "string" ? s.empresa : undefined,
    telefone: typeof s.telefone === "string" ? s.telefone : undefined,
    whatsapp: typeof s.whatsapp === "string" ? s.whatsapp : undefined,
    motivo: typeof s.motivo === "string" ? s.motivo : undefined,
  }),
  head: () => ({
    meta: [
      { title: `${TITLE} | Nexora ISP` },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  const { empresa, telefone, whatsapp, motivo } = Route.useSearch();
  const company = empresa?.trim() || "Seu provedor de internet";
  const wa = (whatsapp ?? telefone ?? "").replace(/\D/g, "");
  const waLink = wa ? `https://wa.me/${wa.length > 11 ? wa : `55${wa}`}?text=${encodeURIComponent("Olá! Minha internet está bloqueada e gostaria de regularizar.")}` : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="border bg-card p-6 md:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{company}</p>
              <h1 className="text-2xl font-extrabold md:text-3xl">Acesso bloqueado</h1>
            </div>
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            {motivo?.trim() || "Sua conexão foi bloqueada por falta de pagamento. Assim que o pagamento for identificado, o acesso é liberado automaticamente."}
          </p>

          <div className="mt-6 space-y-3 text-sm">
            <Step icon={<Receipt className="h-4 w-4 text-primary" />} title="1. Pague a fatura em aberto">
              Use o boleto ou o Pix que você recebeu. Se não tiver em mãos, fale com o atendimento e peça a segunda via.
            </Step>
            <Step icon={<MessageCircle className="h-4 w-4 text-primary" />} title="2. Fale com o atendimento">
              O atendimento confirma o pagamento e libera a conexão na hora.
            </Step>
            <Step icon={<RefreshCw className="h-4 w-4 text-primary" />} title="3. Reinicie o seu roteador">
              Depois da liberação, desligue o equipamento da tomada por 30 segundos e ligue novamente.
            </Step>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            {waLink && (
              <Button asChild className="flex-1">
                <a href={waLink} target="_blank" rel="noreferrer"><MessageCircle />Falar no WhatsApp</a>
              </Button>
            )}
            {telefone && (
              <Button asChild variant="outline" className="flex-1">
                <a href={`tel:${telefone.replace(/[^\d+]/g, "")}`}><Phone />Ligar para o suporte</a>
              </Button>
            )}
            <Button variant="outline" className="flex-1" onClick={() => window.location.reload()}>
              <RefreshCw />Já paguei, testar de novo
            </Button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Esta página é exibida automaticamente enquanto o acesso está bloqueado.
        </p>
      </div>
    </main>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border bg-background p-3">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
