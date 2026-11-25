import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const sendUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userIds: z.array(z.string().uuid()).min(1).max(300),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o administrador pode enviar e-mails aos usuários.");
    const key = process.env["BREVO_API_KEY"];
    if (!key) throw new Error("Chave do Brevo não configurada.");
    const { data: users, error } = await (context.supabase as any).rpc("admin_list_users");
    if (error) throw new Error(error.message);
    const wanted = new Set(data.userIds);
    const targets = ((users ?? []) as any[]).filter((u) => wanted.has(u.id) && u.email) as { id: string; email: string; full_name?: string }[];
    const html = (name: string) => `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:560px">${name ? `<p>Olá, ${esc(name)}!</p>` : ""}${esc(data.body).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}<p>— Equipe Syncron ISP<br><a href="https://rede.syncrontelecom.com">rede.syncrontelecom.com</a></p></div>`;
    let sent = 0, failed = 0, lastError = "";
    for (const u of targets) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "Syncron ISP", email: "contato@syncrontelecom.com" },
          replyTo: { email: "contato@syncrontelecom.com", name: "Syncron ISP" },
          to: [{ email: u.email, ...(u.full_name ? { name: u.full_name } : {}) }],
          subject: data.subject,
          htmlContent: html((u.full_name ?? "").split(" ")[0] ?? ""),
        }),
      });
      if (res.ok) sent++;
      else {
        const b = await res.text(); console.error(`Brevo [${res.status}]: ${b}`);
        lastError = `Brevo [${res.status}]: ${b.slice(0, 300)}`; failed++;
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
      }
    }
    return { sent, failed, lastError };
  });
