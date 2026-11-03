import { createHash, createHmac, timingSafeEqual } from "crypto";

// Token por provedor: "<owner_id>.<hmac>" assinado com RADIUS_API_TOKEN.
export function ownerToken(ownerId: string) {
  const secret = process.env["RADIUS_API_TOKEN"] ?? "";
  const sig = createHmac("sha256", secret).update(ownerId).digest("hex").slice(0, 40);
  return `${ownerId}.${sig}`;
}

function eq(a: string, b: string) {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Retorna o owner_id dono do token, ou null. Token legado (global) = administrador da plataforma. */
export async function resolveOwner(request: Request): Promise<string | null> {
  const secret = process.env["RADIUS_API_TOKEN"];
  if (!secret) return null;
  const url = new URL(request.url);
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
  const m = /^([0-9a-f-]{36})\.[0-9a-f]{40}$/i.exec(given);
  if (m) return eq(given, ownerToken(m[1]!)) ? m[1]! : null;
  if (!eq(given, secret)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("user_id, created_at").eq("role", "admin").order("created_at").limit(1);
  return data?.[0]?.user_id ?? null;
}
