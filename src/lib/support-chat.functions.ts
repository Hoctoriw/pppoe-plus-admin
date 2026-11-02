import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "user" | "assistant"; content: string };

const SYSTEM = `Você é o assistente virtual do Syncron ISP, sistema de gestão para provedores de internet (alternativa moderna ao MK-AUTH), da Syncron Telecom. Responda sempre em português do Brasil, de forma clara, simpática e objetiva, com markdown simples.
Fatos do produto:
- O período de teste de novas contas é definido pelo administrador, com a Rede FTTH liberada durante o teste. Planos: Mensal R$ 100 (30 dias) e Anual R$ 1.000 (365 dias), ambos com Rede FTTH. Pagamento da licença por Pix na aba Licença; os dias pagos somam aos que faltam.
- Cadastro de clientes PPPoE, IPoE e Hotspot, planos de velocidade, IP fixo opcional ou automático (pool 192.168.0.0/16 para ativos; bloqueados recebem 10.0.0.0/8 e vão para a lista "bloqueados" no MikroTik, com página de aviso).
- Servidor RADIUS local (ISO syncron-radius para baixar na aba Download da tela de entrada), com painel web local em http://IP-da-máquina/appliance (login com e-mail e senha do usuário master): status, roteadores autorizados, trocar IP, log.
- MikroTik RouterOS 7 cadastrado pelo IP local; o servidor Syncron faz a ponte, sem precisar de IP público nem abrir portas. Portas RADIUS UDP 1812, 1813 e 3799 (CoA).
- Conexões: mapa de clientes com bolinha verde (conectado) e vermelha (desconectado).
- Rede FTTH: mapa com OLT, CEO, CTO, splitters, cores de fibra, trajetos com ancoragens, cálculo de sinal óptico e ligação de clientes às portas da CTO.
- Financeiro: boletos e Pix via Asaas, baixa automática. Central do Assinante em /central para o cliente final ver faturas e pagar.
- Backup diário automático (30 dias) com restauração. Equipe com abas por usuário. Tudo funciona pelo navegador, sem terminal.
- Suporte humano: suporte@syncrontelecom.com.br.
Se não souber algo ou for questão específica de uma conta, indique o e-mail de suporte. Não invente preços nem recursos. Quando o visitante demonstrar interesse, convide para criar uma conta.`;

export const askSupport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: Msg[] }) => {
    const messages = (input?.messages ?? [])
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!messages.length) throw new Error("Mensagem vazia");
    return { messages };
  })
  .handler(async ({ data, context }) => {
    const { generateResponse } = await import("@lovable.dev/ai-gateway");
    let email = "suporte@syncrontelecom.com.br";
    let trial = "Consulte o administrador sobre o período de teste atual.";
    try {
      const { data: s } = await context.supabase.from("app_settings").select("support_email, trial_days").eq("id", 1).maybeSingle();
      if (s?.support_email) email = s.support_email;
      if (s) trial = s.trial_days === 0 ? "O teste grátis está desativado para novas contas." : `Novas contas recebem ${s.trial_days} dias de teste grátis. Contas existentes mantêm sua validade anterior.`;
    } catch { /* usa o padrão */ }
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions: `${SYSTEM.replaceAll("suporte@syncrontelecom.com.br", email)}\n${trial}`,
        // Só mensagens do visitante entram como entrada; respostas anteriores vão como contexto não confiável.
        input: data.messages.filter((m) => m.role === "user").map((m) => ({ role: "user" as const, content: m.content })),
      });
      const text = ((res as any).output ?? [])
        .flatMap((o: any) => (o.type === "message" ? o.content ?? [] : []))
        .filter((c: any) => c.type === "output_text")
        .map((c: any) => c.text)
        .join("");
      return { reply: text || "Desculpe, não consegui responder agora." };
    } catch (e) {
      console.error("support chat", e);
      return { reply: "O assistente está indisponível no momento. Escreva para suporte@syncrontelecom.com.br." };
    }
  });
