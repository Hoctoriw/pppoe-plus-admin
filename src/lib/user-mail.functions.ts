import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { trackedDelivery } from "./user-message-utils";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const sendUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    userIds: z.array(z.string().uuid()).min(1).max(300),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(10000),
    parentId: z.string().uuid().optional(),
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
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (data.parentId) {
      const { data: parent, error: parentError } = await context.supabase.from("user_messages").select("recipient_id").eq("id", data.parentId).single();
      if (parentError || !parent || targets.length !== 1 || targets[0]?.id !== parent.recipient_id) throw new Error("O atendimento anterior deve pertencer ao mesmo destinatário.");
    }
    let sent = 0, failed = 0, unknown = 0, lastError = "";
    for (const u of targets) {
      const { data: row, error: recordError } = await db.from("user_messages").insert({
        sender_id: context.userId, recipient_id: u.id, recipient_email: u.email,
        recipient_name: u.full_name ?? "", subject: data.subject, body: data.body, parent_id: data.parentId ?? null,
      }).select("id").single();
      if (recordError || !row) throw new Error("Não foi possível registrar a mensagem; nenhum envio foi iniciado para este destinatário.");
      const result = await trackedDelivery(() => fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { name: "Syncron ISP", email: "contato@syncrontelecom.com" },
          replyTo: { email: "contato@syncrontelecom.com", name: "Syncron ISP" },
          to: [{ email: u.email, ...(u.full_name ? { name: u.full_name } : {}) }],
          subject: data.subject,
          htmlContent: html((u.full_name ?? "").split(" ")[0] ?? ""),
        }),
      }), async (result) => {
        const { error: updateError } = await db.from("user_messages").update(result).eq("id", row.id);
        if (updateError) throw new Error("Envio processado, mas não foi possível atualizar o histórico. Verifique o Brevo antes de reenviar.");
      });
      if (result.status === "sent") sent++;
      else {
        if (result.status === "unknown") unknown++; else failed++;
        lastError = result.error ?? "";
      }
    }
    return { sent, failed, unknown, lastError };
  });

export const listUserMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ recipientId: z.string().uuid().optional(), page: z.number().int().min(0).default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas o administrador pode consultar os atendimentos.");
    let query = context.supabase.from("user_messages").select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id").range(data.page * 20, data.page * 20 + 19);
    if (data.recipientId) query = query.eq("recipient_id", data.recipientId);
    const { data: messages, count, error } = await query;
    if (error) throw new Error(error.message);
    return { messages: messages ?? [], total: count ?? 0 };
  });
