import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Só no servidor local: entra com a conta da nuvem, cria/atualiza a mesma conta aqui
// (mesmo ID, para os dados casarem) e deixa o sincronismo pronto para o agendador local.
export const loginWithCloudAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    url: z.string().trim().url().max(200),
    email: z.string().trim().email().max(200),
    password: z.string().min(6).max(200),
  }).parse(d))
  .handler(async ({ data }) => {
    const local = String(process.env.SUPABASE_URL ?? "");
    if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(local)) throw new Error("Disponível apenas no servidor local.");
    const url = data.url.replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${url}/api/public/onprem/cloud-login`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
    } catch { throw new Error("Sem conexão com o painel online. Verifique a internet do servidor."); }
    const info = await res.json().catch(() => ({})) as { error?: string; token?: string; user_id?: string; full_name?: string };
    if (!res.ok || !info.token || !info.user_id) throw new Error(info.error ?? "O painel online recusou o acesso.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
    if ((admins ?? []).some((a: any) => a.user_id !== info.user_id)) {
      throw new Error("Este servidor já tem outra conta principal. Entre com e-mail e senha locais.");
    }
    const { data: existing } = await db.auth.admin.getUserById(info.user_id);
    if (existing?.user) {
      await db.auth.admin.updateUserById(info.user_id, { password: data.password, email: data.email, email_confirm: true });
    } else {
      const { error } = await db.auth.admin.createUser({
        id: info.user_id, email: data.email, password: data.password, email_confirm: true,
        user_metadata: { full_name: info.full_name ?? "" },
      });
      if (error) throw new Error("Não foi possível criar a conta local: " + error.message);
    }
    await db.from("user_roles").upsert({ user_id: info.user_id, role: "admin" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    await db.from("cloud_pairing_state").delete().eq("owner_id", info.user_id);
    await db.from("cloud_pairing_state").insert({ owner_id: info.user_id, online_url: url, code: "login", poll_secret: info.token, status: "ready" });
    return { ok: true };
  });
