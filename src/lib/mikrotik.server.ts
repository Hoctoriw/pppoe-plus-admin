export type RouterCreds = { base_url: string; username: string; password: string };

export const BLOCK_PROFILE = "nexora-bloqueio";
export const BLOCK_LIST = "nexora_bloqueados";

export function profileName(planName: string) {
  return "nexora-" + planName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function ros<T = any>(r: RouterCreds, method: string, path: string, body?: unknown): Promise<T> {
  const url = r.base_url.replace(/\/+$/, "") + "/rest" + path;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: "Basic " + btoa(`${r.username}:${r.password}`), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new Error("Roteador inacessível: " + (e instanceof Error ? e.message : String(e)));
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j.detail || j.message || text; } catch { /* ignore */ }
    throw new Error(`MikroTik ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Create or update a single item identified by a filter. */
export async function upsert(r: RouterCreds, path: string, filter: Record<string, string>, values: Record<string, string>) {
  const qs = new URLSearchParams(filter).toString();
  const found = await ros<any[]>(r, "GET", `${path}?${qs}`);
  if (found?.length) {
    await ros(r, "PATCH", `${path}/${encodeURIComponent(found[0][".id"])}`, values);
    return found[0][".id"] as string;
  }
  const created = await ros<any>(r, "PUT", path, { ...filter, ...values });
  return created?.[".id"] as string;
}

export async function removeWhere(r: RouterCreds, path: string, filter: Record<string, string>) {
  const found = await ros<any[]>(r, "GET", `${path}?${new URLSearchParams(filter)}`);
  for (const f of found ?? []) await ros(r, "DELETE", `${path}/${encodeURIComponent(f[".id"])}`);
}
