import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Conexão do servidor local (on-premise) com a nuvem, sem colar chaves no terminal.
// - No painel LOCAL: requestCloudPairing pede o código e getCloudPairingState mostra a situação.
// - No painel ONLINE: approveOnpremPairing autoriza o código digitado pelo dono.

async function requireOwner(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("owner_id").eq("user_id", context.userId).not("owner_id", "is", null).maybeSingle();
  const owner = (data?.owner_id as string | undefined) ?? context.userId;
  if (owner !== context.userId) throw new Error("Apenas o dono da conta pode fazer isto.");
  return owner;
}

export type CloudPairingState = { online_url: string; code: string; status: string; created_at: string } | null;

export const getCloudPairingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("cloud_pairing_state" as any)
      .select("online_url,code,status,created_at")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data ?? null) as CloudPairingState;
  });

export const requestCloudPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().trim().url("Digite um endereço válido (https://...).").max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context);
    const url = data.url.replace(/\/+$/, "");
    const res = await fetch(`${url}/api/public/onprem/pair-request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`O painel online (${url}) não respondeu ao pedido de conexão.`);
    const info = (await res.json()) as { code: string; poll_secret: string; expires_at: string };
    await context.supabase.from("cloud_pairing_state" as any).delete().eq("owner_id", context.userId);
    const { error } = await context.supabase.from("cloud_pairing_state" as any).insert({
      owner_id: context.userId,
      online_url: url,
      code: info.code,
      poll_secret: info.poll_secret,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { code: info.code, online_url: url, expires_at: info.expires_at };
  });

export const approveOnpremPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/, "Digite os 6 números do código.") }).parse(d))
  .handler(async ({ data, context }) => {
    await requireOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createHash, randomBytes } = await import("crypto");
    const db = supabaseAdmin as any;
    const { data: p } = await db.from("onprem_pairings").select("*").eq("code", data.code).eq("status", "pending").maybeSingle();
    if (!p || new Date(p.expires_at) < new Date()) throw new Error("Código inválido ou expirado. Peça um novo no servidor local (página Backup).");
    const token = `nxs_${randomBytes(32).toString("hex")}`;
    const token_hash = createHash("sha256").update(token).digest("hex");
    const { error } = await db.from("onprem_sync_tokens").upsert(
      { owner_id: context.userId, token_hash, created_at: new Date().toISOString(), last_used_at: null },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    await db.from("onprem_pairings").update({ status: "approved", owner_id: context.userId, issued_token: token }).eq("code", data.code);
    return { ok: true };
  });
