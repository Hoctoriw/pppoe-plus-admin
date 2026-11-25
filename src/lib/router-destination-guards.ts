import { assertPublicRouterUrl } from "./tenant-network-guards";

export function routerDestination(raw: string) {
  assertPublicRouterUrl(raw);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Conexão direta exige HTTPS e apenas domínio/IP e porta, sem caminho ou parâmetros.");
  }
  return url.origin;
}

export async function requireRouterMaster(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (error || data !== true) throw new Error("Somente o master pode aprovar destinos de roteadores.");
}

export async function approvedRouterDestination(db: any, router: { id?: string; owner_id?: string; base_url: string }) {
  const destination = routerDestination(router.base_url);
  if (!router.id || !router.owner_id) throw new Error("Roteador sem identificação para aprovação.");
  const { data, error } = await db.from("router_destination_approvals")
    .select("base_url").eq("router_id", router.id).eq("owner_id", router.owner_id).maybeSingle();
  if (error || !data || data.base_url !== destination) {
    throw new Error("Destino não aprovado pelo master. Solicite aprovação em MikroTik ou use o servidor local.");
  }
  return destination;
}

/** Redirects must not turn an approved router into an arbitrary destination. */
export async function fetchApprovedRouter(db: any, router: { id?: string; owner_id?: string; base_url: string; username: string; password: string }, method: string, path: string, body?: unknown) {
  const destination = await approvedRouterDestination(db, router);
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Caminho do roteador inválido.");
  const url = new URL(destination + "/rest" + path);
  if (url.origin !== destination) throw new Error("Destino do roteador inválido.");
  const response = await fetch(url, {
    method, redirect: "error",
    headers: { Authorization: "Basic " + btoa(`${router.username}:${router.password}`), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : null,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status >= 300 && response.status < 400) throw new Error("Redirecionamento de roteador não permitido.");
  return response;
}