import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Apenas o administrador pode usar a prospecção.");
}

const rowSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  company: z.string().trim().max(200).default(""),
  city: z.string().trim().max(120).default(""),
  uf: z.string().trim().toUpperCase().max(2).default(""),
});

export const importProspects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(z.unknown()).max(30000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const seen = new Set<string>();
    const rows = data.rows.flatMap((r) => { const p = rowSchema.safeParse(r); if (!p.success || seen.has(p.data.email)) return []; seen.add(p.data.email); return [p.data]; });
    let added = 0;
    for (let i = 0; i < rows.length; i += 1000) {
      const { data: ins, error } = await context.supabase.from("prospects").upsert(rows.slice(i, i + 1000), { onConflict: "email", ignoreDuplicates: true }).select("id");
      if (error) throw new Error(error.message);
      added += ins?.length ?? 0;
    }
    return { valid: rows.length, added };
  });

export const prospectStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const out: Record<string, number> = {};
    for (const s of ["pendente", "enviado", "falhou", "descadastrado"]) {
      const { count } = await context.supabase.from("prospects").select("id", { count: "exact", head: true }).eq("status", s);
      out[s] = count ?? 0;
    }
    const { data: recent } = await context.supabase.from("prospects").select("email,company,uf,status,sent_at,error").neq("status", "pendente").order("sent_at", { ascending: false, nullsFirst: false }).limit(50);
    return { counts: out, recent: recent ?? [] };
  });

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

export const sendProspectBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(100), uf: z.string().max(2).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const key = process.env["BREVO_API_KEY"];
    if (!key) throw new Error("Chave do Brevo não configurada.");
    let q = context.supabase.from("prospects").select("id,email,company").eq("status", "pendente").order("created_at").limit(data.limit);
    if (data.uf) q = q.eq("uf", data.uf.toUpperCase());
    const { data: list, error } = await q;
    if (error) throw new Error(error.message);
    let sent = 0, failed = 0, lastError = "";
    for (const p of list ?? []) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "Syncron ISP", email: "contato@syncrontelecom.com" },
          replyTo: { email: "contato@syncrontelecom.com", name: "Phelip Santos" },
          to: [{ email: p.email }],
          subject: "Conheça o Syncron ISP: sua rede FTTH no mapa e 30 dias grátis",
          htmlContent: html(p.company),
        }),
      });
      if (res.ok) { sent++; await context.supabase.from("prospects").update({ status: "enviado", sent_at: new Date().toISOString(), error: null }).eq("id", p.id); }
      else {
        const body = await res.text(); console.error(`Brevo [${res.status}]: ${body}`);
        lastError = `Brevo [${res.status}]: ${body.slice(0, 300)}`;
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        failed++; await context.supabase.from("prospects").update({ status: "falhou", sent_at: new Date().toISOString(), error: lastError }).eq("id", p.id);
      }
    }
    return { sent, failed, lastError };
  });

export const unsubscribeProspect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ email: z.string().trim().toLowerCase().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await context.supabase.from("prospects").upsert({ email: data.email, status: "descadastrado" }, { onConflict: "email" });
    return { ok: true };
  });
