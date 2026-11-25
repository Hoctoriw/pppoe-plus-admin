import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function html(company: string) {
  const c = company ? ` da <b>${company.replace(/[<>&"]/g, "")}</b>` : "";
  return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:560px">
<p>Olá, tudo bem?</p>
<p>Sou o Phelip, da <b>Syncron ISP</b>. Criamos um sistema moderno para provedores de internet${c} — alternativa ao MK-AUTH, direto no navegador.</p>
<ul><li>Clientes, planos e PPPoE/IPoE integrados ao MikroTik e RADIUS</li><li>Rede FTTH no mapa: OLT, CEO, CTO, cores das fibras e sinal</li><li>Financeiro com boletos, Pix e bloqueio automático</li><li>Monitoramento de MikroTik e OLTs</li></ul>
<p><a href="https://youtu.be/tEV1xSw6jRE" style="color:#2563eb">▶ Veja o vídeo de 30 segundos</a></p>
<p><a href="https://rede.syncrontelecom.com" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Testar grátis por 30 dias</a></p>
<p>Qualquer dúvida é só responder este e-mail.</p>
<p>Abraço,<br>Phelip Santos<br>Syncron ISP</p>
<p style="font-size:12px;color:#6b7280">Se não quiser receber mais mensagens, responda com "SAIR".</p></div>`;
}

export async function deliverProspects(db: SupabaseClient<Database>, options: { limit: number; uf?: string }) {
  const key = process.env["BREVO_API_KEY"];
  if (!key) throw new Error("Chave do Brevo não configurada.");
  let query = db.from("prospects").select("id,email,company").eq("status", "pendente").is("claimed_at", null).order("created_at").limit(options.limit);
  if (options.uf) query = query.eq("uf", options.uf);
  const { data: list, error } = await query;
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0, lastError = "", stopped = false;
  // Three deliveries keep database and provider calls within six outbound connections.
  for (let i = 0; i < (list?.length ?? 0) && !stopped; i += 3) {
    await Promise.all((list ?? []).slice(i, i + 3).map(async (p) => {
      const { data: claim, error: claimError } = await db.from("prospects").update({ claimed_at: new Date().toISOString() }).eq("id", p.id).eq("status", "pendente").is("claimed_at", null).select("id").maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!claim) return;
      try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", signal: AbortSignal.timeout(15000),
          headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { name: "Syncron ISP", email: "contato@syncrontelecom.com" },
            replyTo: { email: "contato@syncrontelecom.com", name: "Phelip Santos" },
            to: [{ email: p.email }], subject: "Conheça o Syncron ISP: sua rede FTTH no mapa e 30 dias grátis", htmlContent: html(p.company),
          }),
        });
        if (res.ok) {
          await res.text();
          const { error: saved } = await db.from("prospects").update({ status: "enviado", sent_at: new Date().toISOString(), error: null }).eq("id", p.id);
          if (saved) throw new Error("Brevo aceitou, mas o registro falhou: " + saved.message);
          sent++;
        } else {
          const body = await res.text();
          lastError = `Brevo [${res.status}]: ${body.slice(0, 300)}`;
          if ([401, 403, 429].includes(res.status)) {
            stopped = true;
            const { error: released } = await db.from("prospects").update({ claimed_at: null, error: lastError }).eq("id", p.id);
            if (released) throw new Error(released.message);
          } else {
            failed++;
            const { error: saved } = await db.from("prospects").update({ status: "falhou", sent_at: new Date().toISOString(), error: lastError }).eq("id", p.id);
            if (saved) throw new Error(saved.message);
          }
        }
      } catch (e) {
        failed++; stopped = true;
        lastError = `Resultado incerto; não reenviar automaticamente: ${e instanceof Error ? e.message : "Falha de conexão"}`;
        await db.from("prospects").update({ status: "falhou", error: lastError }).eq("id", p.id);
      }
    }));
  }
  return { sent, failed, lastError };
}
